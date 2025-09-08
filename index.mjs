import { Client } from '@notionhq/client';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

// Configuration from environment
const config = {
  notion: {
    token: process.env.NOTION_TOKEN,
    databaseId: process.env.NOTION_DATABASE_ID
  },
  supabase: {
    url: process.env.SUPABASE_URL,
    serviceRole: process.env.SUPABASE_SERVICE_ROLE,
    anonKey: process.env.SUPABASE_ANON_KEY
  },
  rateLimit: {
    notionDelay: 350,
    supabaseDelay: 100,
    batchSize: 25
  },
  retry: {
    maxAttempts: 3,
    baseDelay: 1000
  }
};

// CLI arguments
const args = process.argv.slice(2);
const flags = {
  once: args.includes('--once'),
  dryRun: args.includes('--dry-run'),
  verbose: args.includes('--verbose'),
  since: args.find(a => a.startsWith('--since='))?.split('=')[1]
};

// Logger
const log = {
  info: (msg, data = {}) => console.log(`[INFO] ${msg}`, flags.verbose ? data : ''),
  warn: (msg, data = {}) => console.warn(`[WARN] ${msg}`, flags.verbose ? data : ''),
  error: (msg, data = {}) => console.error(`[ERROR] ${msg}`, data),
  debug: (msg, data = {}) => flags.verbose && console.log(`[DEBUG] ${msg}`, data)
};

// Validate configuration
function validateConfig() {
  if (!config.notion.token) {
    log.error('Missing NOTION_TOKEN in environment');
    process.exit(1);
  }
  if (!config.notion.databaseId) {
    log.error('Missing NOTION_DATABASE_ID in environment');
    process.exit(1);
  }
  if (!config.supabase.url) {
    log.error('Missing SUPABASE_URL in environment');
    process.exit(1);
  }
  if (!config.supabase.serviceRole && !config.supabase.anonKey) {
    log.error('Missing both SUPABASE_SERVICE_ROLE and SUPABASE_ANON_KEY');
    process.exit(1);
  }
  if (!config.supabase.serviceRole) {
    log.warn('No SUPABASE_SERVICE_ROLE found, using ANON_KEY (limited permissions)');
  }
}

// Initialize clients
validateConfig();

const notion = new Client({ auth: config.notion.token });
const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceRole || config.supabase.anonKey
);

// Helper: Sleep for rate limiting
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: Retry with exponential backoff
async function retryWithBackoff(fn, maxAttempts = config.retry.maxAttempts) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isRetryable = 
        error.status === 429 || 
        error.status >= 500 ||
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT';
      
      if (!isRetryable || attempt === maxAttempts) {
        throw error;
      }
      
      const delay = config.retry.baseDelay * Math.pow(2, attempt - 1);
      log.debug(`Retry attempt ${attempt}/${maxAttempts} after ${delay}ms`, { error: error.message });
      await sleep(delay);
    }
  }
}

// Helper: Calculate hash of Notion properties
function calculateHash(properties) {
  const relevant = {
    title: properties.Title?.title?.[0]?.plain_text || '',
    brand: properties.Brand?.select?.name || '',
    project: properties.Project?.rich_text?.[0]?.plain_text || '',
    milestone: properties.Milestone?.rich_text?.[0]?.plain_text || '',
    priority: properties.Priority?.select?.name || '',
    due: properties.Due?.date?.start || '',
    assignee: properties.Assignee?.rich_text?.[0]?.plain_text || ''
  };
  return createHash('sha256').update(JSON.stringify(relevant)).digest('hex');
}

// Helper: Extract property values
function extractProperties(page) {
  const props = page.properties;
  return {
    title: props.Title?.title?.[0]?.plain_text || 'Untitled',
    brand: props.Brand?.select?.name || null,
    project: props.Project?.rich_text?.[0]?.plain_text || null,
    milestone: props.Milestone?.rich_text?.[0]?.plain_text || null,
    priority: props.Priority?.select?.name || null,
    dueDate: props.Due?.date?.start || null,
    assignee: props.Assignee?.rich_text?.[0]?.plain_text || null,
    supabaseTaskId: props['Supabase Task ID']?.rich_text?.[0]?.plain_text || null,
    linked: props['Linked ✅']?.checkbox || false
  };
}

// Get cursor from Supabase
async function getCursor() {
  try {
    const { data, error } = await supabase
      .from('sync_state')
      .select('last_synced_at, cursor_data')
      .eq('source', 'notion_quick_capture')
      .single();
    
    if (error) throw error;
    return data?.last_synced_at || new Date(Date.now() - 3600000).toISOString();
  } catch (error) {
    log.warn('Could not fetch cursor, using 1 hour ago', { error: error.message });
    return new Date(Date.now() - 3600000).toISOString();
  }
}

// Set cursor in Supabase
async function setCursor(timestamp) {
  if (flags.dryRun) {
    log.info('Dry run: Would update cursor to', { timestamp });
    return;
  }
  
  try {
    const { error } = await supabase
      .from('sync_state')
      .upsert({
        source: 'notion_quick_capture',
        last_synced_at: timestamp,
        cursor_data: { timestamp },
        updated_at: new Date().toISOString()
      }, { onConflict: 'source' });
    
    if (error) throw error;
    log.debug('Cursor updated', { timestamp });
  } catch (error) {
    log.error('Failed to update cursor', { error: error.message });
  }
}

// Query Notion for updated pages
async function getUpdatedPagesSince(sinceISO) {
  const body = {
    page_size: config.rateLimit.batchSize,
    sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }]
  };
  
  if (sinceISO) {
    body.filter = {
      timestamp: 'last_edited_time',
      last_edited_time: { on_or_after: sinceISO }
    };
  }
  
  log.debug('Querying Notion', { since: sinceISO });
  
  return await retryWithBackoff(async () => {
    const response = await notion.databases.query({
      database_id: config.notion.databaseId,
      ...body
    });
    return response.results;
  });
}

// Create task in Supabase via RPC
async function createTaskInSupabase(pageData, notionPageId, hash) {
  if (flags.dryRun) {
    log.info('Dry run: Would create task', pageData);
    return { task_id: 'dry-run-id' };
  }
  
  return await retryWithBackoff(async () => {
    const { data, error } = await supabase.rpc('create_task_from_capture_by_names', {
      p_brand: pageData.brand,
      p_project_name: pageData.project,
      p_title: pageData.title,
      p_milestone_name: pageData.milestone,
      p_priority: pageData.priority,
      p_due: pageData.dueDate,
      p_assignee_email: pageData.assignee,
      p_notion_page_id: notionPageId
    });
    
    if (error) throw error;
    return { task_id: data }; // Your function returns UUID directly, bridge expects {task_id: uuid}
  });
}

// Update Notion page with Supabase task ID
async function updateNotionPage(pageId, taskId) {
  if (flags.dryRun) {
    log.info('Dry run: Would update Notion page', { pageId, taskId });
    return;
  }
  
  await sleep(config.rateLimit.notionDelay);
  
  return await retryWithBackoff(async () => {
    await notion.pages.update({
      page_id: pageId,
      properties: {
        'Supabase Task ID': {
          rich_text: [{
            type: 'text',
            text: { content: taskId }
          }]
        },
        'Linked ✅': {
          checkbox: true
        }
      }
    });
  });
}

// Check if task needs sync
async function needsSync(notionPageId, currentHash) {
  try {
    const { data, error } = await supabase
      .from('integrations_notion')
      .select('external_hash')
      .eq('notion_page_id', notionPageId)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
    return !data || data.external_hash !== currentHash;
  } catch (error) {
    log.debug('Error checking sync status', { error: error.message });
    return true;
  }
}

// Main sync process
async function syncPages() {
  const startTime = Date.now();
  const cursor = flags.since || await getCursor();
  
  log.info('Starting sync', { 
    cursor, 
    mode: flags.dryRun ? 'dry-run' : 'live',
    once: flags.once 
  });
  
  try {
    const pages = await getUpdatedPagesSince(cursor);
    log.info(`Found ${pages.length} pages to process`);
    
    let created = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const page of pages) {
      try {
        const props = extractProperties(page);
        const hash = calculateHash(page.properties);
        
        // Skip if already linked
        if (props.linked && props.supabaseTaskId) {
          const needUpdate = await needsSync(page.id, hash);
          if (!needUpdate) {
            log.debug('Skipping already linked page', { id: page.id });
            skipped++;
            continue;
          }
        }
        
        // Create task in Supabase
        const result = await createTaskInSupabase(props, page.id, hash);
        
        if (result?.task_id) {
          // Update external hash in integrations table
          if (!flags.dryRun) {
            await supabase
              .from('integrations_notion')
              .update({ external_hash: hash, last_seen_at: new Date().toISOString() })
              .eq('notion_page_id', page.id);
          }
          
          // Update Notion page
          await updateNotionPage(page.id, result.task_id);
          log.info(`Created task: ${props.title}`, { taskId: result.task_id });
          created++;
        }
        
        // Rate limit between operations
        await sleep(config.rateLimit.supabaseDelay);
        
      } catch (error) {
        log.error(`Failed to process page ${page.id}`, { error: error.message });
        errors++;
      }
    }
    
    // Update cursor to latest page timestamp
    if (pages.length > 0 && !flags.dryRun) {
      const latestTimestamp = pages[0].last_edited_time;
      await setCursor(latestTimestamp);
    }
    
    const duration = Math.round((Date.now() - startTime) / 1000);
    log.info('Sync complete', { created, skipped, errors, duration: `${duration}s` });
    
  } catch (error) {
    log.error('Sync failed', { error: error.message });
    process.exit(1);
  }
}

// Main execution
async function main() {
  log.info('QC Bridge v2.0 starting');
  
  if (flags.once) {
    await syncPages();
  } else {
    // Continuous mode
    while (true) {
      await syncPages();
      log.info('Waiting 60 seconds for next sync...');
      await sleep(60000);
    }
  }
}

// Handle shutdown
process.on('SIGINT', () => {
  log.info('Shutting down gracefully');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log.info('Shutting down gracefully');
  process.exit(0);
});

// Run
main().catch(error => {
  log.error('Fatal error', { error: error.message });
  process.exit(1);
});
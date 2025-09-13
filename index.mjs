import { Client } from '@notionhq/client';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import { createServer } from 'http';
import dotenv from 'dotenv';
import { EnhancedLogger } from './enhanced-logger.mjs';
import { MetricsCollector } from './metrics-collector.mjs';

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
  },
  server: {
    port: process.env.PORT || 3000,
    enableHealthCheck: true
  }
};

// CLI arguments
const args = process.argv.slice(2);
const flags = {
  once: args.includes('--once'),
  dryRun: args.includes('--dry-run'),
  verbose: args.includes('--verbose'),
  since: args.find(a => a.startsWith('--since='))?.split('=')[1],
  server: args.includes('--server')
};

// Initialize enhanced logging and metrics
const logger = new EnhancedLogger({
  level: flags.verbose ? 'debug' : 'info',
  serviceName: 'qc-bridge',
  environment: process.env.NODE_ENV || 'production',
  version: '2.1.0',
  enableNotionAlerts: !flags.dryRun, // Disable Notion alerts in dry-run mode
  notionToken: config.notion.token,
  notionAlertsDbId: process.env.NOTION_ALERTS_DATABASE_ID
});

// Validate configuration
function validateConfig() {
  const required = [
    { key: 'NOTION_TOKEN', value: config.notion.token },
    { key: 'NOTION_DATABASE_ID', value: config.notion.databaseId },
    { key: 'SUPABASE_URL', value: config.supabase.url }
  ];

  const missing = required.filter(r => !r.value);
  if (missing.length > 0) {
    logger.fatal('Missing required environment variables', { 
      missing: missing.map(m => m.key) 
    });
    process.exit(1);
  }

  if (!config.supabase.serviceRole && !config.supabase.anonKey) {
    logger.fatal('Missing both SUPABASE_SERVICE_ROLE and SUPABASE_ANON_KEY');
    process.exit(1);
  }

  if (!config.supabase.serviceRole) {
    logger.warn('No SUPABASE_SERVICE_ROLE found, using ANON_KEY (limited permissions)');
  }
}

// Initialize clients
validateConfig();

const notion = new Client({ auth: config.notion.token });
const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceRole || config.supabase.anonKey
);

// Initialize metrics collector
const metrics = new MetricsCollector(logger, supabase);

// Helper: Sleep for rate limiting
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Enhanced retry with metrics
async function retryWithBackoff(fn, maxAttempts = config.retry.maxAttempts, context = {}) {
  const operationId = metrics.startOperation('retry_operation', context);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      metrics.addOperationStep(operationId, `attempt_${attempt}`);
      const result = await fn();
      metrics.completeOperation(operationId, { attempts: attempt, success: true });
      return result;
    } catch (error) {
      const isRetryable = 
        error.status === 429 || 
        error.status >= 500 ||
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT';
      
      if (!isRetryable || attempt === maxAttempts) {
        metrics.failOperation(operationId, error, { attempts: attempt });
        throw error;
      }
      
      const delay = config.retry.baseDelay * Math.pow(2, attempt - 1);
      metrics.addOperationStep(operationId, `retry_delay_${attempt}`, { delay_ms: delay });
      
      logger.debug('Retry attempt', { 
        attempt, 
        maxAttempts, 
        delay_ms: delay,
        error: error.message,
        operation_id: operationId
      });
      
      await sleep(delay);
    }
  }
}

// Enhanced API call wrapper
async function makeApiCall(service, endpoint, apiFunction, context = {}) {
  const startTime = Date.now();
  const operationId = metrics.startOperation('api_call', { service, endpoint, ...context });
  
  try {
    metrics.addOperationStep(operationId, 'api_request_start');
    const result = await apiFunction();
    const duration = Date.now() - startTime;

    const responseSize = (typeof result === 'undefined') ? 0 : JSON.stringify(result).length;
    
    metrics.recordApiCall(service, endpoint, duration, true);
    metrics.completeOperation(operationId, { 
      success: true, 
      duration_ms: duration,
      response_size: responseSize 
    });
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    metrics.recordApiCall(service, endpoint, duration, false);
    metrics.failOperation(operationId, error, { duration_ms: duration });
    throw error;
  }
}

// Helper: Synchronous normalization for focus slot used in hashing
function normalizeFocusSlotForHash(val) {
  if (!val) return '';
  const stripped = String(val).replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\p{Emoji}\s]+/u, '').trim();
  // Map common known variants to canonical non-emoji names for stable hashing
  const mapping = {
    'morning routine': 'Morning Routine',
    'deep work block 1': 'Deep Work Block 1',
    'admin block 1': 'Admin Block 1',
    'recharge & rest': 'Recharge & Rest',
    'deep work block 2': 'Deep Work Block 2',
    'admin block 2': 'Admin Block 2',
    'shutdown routine': 'Shutdown Routine'
  };
  const key = stripped.toLowerCase();
  return mapping[key] || stripped;
}

// Helper: Calculate hash of Notion properties
function calculateHash(properties) {
  const rawFocusSlot = properties['Focus Slot']?.select?.name || '';
  const rawStatus = properties.Status?.select?.name || '';
  const rawPriority = properties.Priority?.select?.name || '';
  const relevant = {
    title: properties.Task?.title?.[0]?.plain_text || '',
    domain: properties.Domain?.select?.name?.toLowerCase() || '',
    venture: properties.Venture?.select?.name?.toLowerCase() || '',
    project: properties.Project?.rich_text?.[0]?.plain_text || '',
    milestone: properties.Milestone?.rich_text?.[0]?.plain_text || '',
    priority: mapPriority(rawPriority) || '',
    due: properties['Due Date']?.date?.start || '',
    assignee: properties.Assignee?.rich_text?.[0]?.plain_text || '',
    status: mapStatus(rawStatus) || '',
    focusSlot: normalizeFocusSlotForHash(rawFocusSlot) || '',
    focusDate: properties['Focus Date']?.date?.start || ''
  };
  return createHash('sha256').update(JSON.stringify(relevant)).digest('hex');
}

// Helper: Normalize focus slot to canonical non-emoji value using DB list if available
async function mapFocusSlotAsync(notionValue) {
  if (!notionValue) return null;
  const val = String(notionValue).trim();

  // Strip known emoji prefixes quickly
  const stripped = val.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\p{Emoji}\s]+/u, '').trim();

  // Try exact match against DB (focus_slots.slot) and partial insensitively
  try {
    const { data, error } = await supabase
      .from('focus_slots')
      .select('slot')
      .ilike('slot', `%${stripped}%`);

    if (!error && data && data.length > 0) {
      // Prefer exact case-insensitive match first
      const exact = data.find(d => d.slot.toLowerCase() === stripped.toLowerCase());
      return exact ? exact.slot : data[0].slot;
    }
  } catch {}

  // Fallbacks: common names
  const fallbacks = ['Morning Routine','Deep Work Block 1','Admin Block 1','Recharge & Rest','Deep Work Block 2','Admin Block 2','Shutdown Routine'];
  const found = fallbacks.find(s => s.toLowerCase().includes(stripped.toLowerCase()) || stripped.toLowerCase().includes(s.toLowerCase()));
  if (found) return found;

  logger.warn('Unknown focus slot value, setting to null', { notion_value: notionValue });
  return null;
}

// Helper: Normalize priority to non-emoji values: P0,P1,P2,P3
function mapPriority(val) {
  if (!val) return null;
  const v = String(val).trim().toLowerCase();
  if (v.includes('p0') || v.includes('urgent')) return 'P0';
  if (v.includes('p1') || v.includes('high') || v.includes('🔥')) return 'P1';
  if (v.includes('p2') || v.includes('medium') || v.includes('🟡')) return 'P2';
  if (v.includes('p3') || v.includes('low') || v.includes('🟢')) return 'P3';
  // Fallback default
  return 'P2';
}

// Helper: Map task status values to non-emoji canonical variants
function mapStatus(notionValue) {
  if (!notionValue) return null;
  const value = String(notionValue).trim();
  const lower = value.toLowerCase();

  if (/[📝🔄✅⏸️]/.test(value)) {
    // Strip emoji and map
    if (value.includes('On Hold')) return 'On Hold';
    if (value.includes('In Progress')) return 'In Progress';
    if (value.includes('Done') || value.includes('Complete')) return 'Done';
    return 'To Do';
  }

  if (lower.includes('hold')) return 'On Hold';
  if (lower.includes('progress')) return 'In Progress';
  if (lower.includes('done') || lower.includes('complete')) return 'Done';
  if (lower.includes('to do') || lower === 'todo' || lower === 'to-do') return 'To Do';

  // Fallback to default 'To Do' to avoid constraint issues
  logger.warn('Unknown status value, defaulting to "To Do"', { notion_value: notionValue });
  return 'To Do';
}

// Helper: Extract property values
function extractProperties(page) {
  const props = page.properties;
  const rawFocusSlot = props['Focus Slot']?.select?.name || null;
  const rawStatus = props.Status?.select?.name || null;
  
  return {
    title: props.Task?.title?.[0]?.plain_text || 'Untitled',
    domain: props.Domain?.select?.name?.toLowerCase() || null,
    venture: props.Venture?.select?.name?.toLowerCase() || null,
    area: props.Venture?.select?.name?.toLowerCase() || props.Domain?.select?.name?.toLowerCase() || null, // For RPC compatibility
    project: props.Project?.rich_text?.[0]?.plain_text || null,
    milestone: props.Milestone?.rich_text?.[0]?.plain_text || null,
    priority: mapPriority(props.Priority?.select?.name || null),
    dueDate: props['Due Date']?.date?.start || null,
    assignee: props.Assignee?.rich_text?.[0]?.plain_text || null,
    status: mapStatus(rawStatus),
    // Note: mapFocusSlotAsync is async; we will resolve it during task creation
    focusSlot: rawFocusSlot,
    focusDate: props['Focus Date']?.date?.start || null,
    supabaseTaskId: props['Supabase Task ID']?.rich_text?.[0]?.plain_text || null,
    linked: props.Linked?.checkbox || false
  };
}

// Enhanced cursor management
async function getCursor() {
  return await makeApiCall('supabase', 'get_cursor', async () => {
    const { data, error } = await supabase
      .from('sync_state')
      .select('last_synced_at, cursor_data')
      .eq('source', 'notion_quick_capture')
      .single();
    
    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
    return data?.last_synced_at || new Date(Date.now() - 3600000).toISOString();
  }, { operation: 'get_cursor' });
}

async function setCursor(timestamp) {
  if (flags.dryRun) {
    logger.info('Dry run: Would update cursor', { timestamp });
    return;
  }
  
  return await makeApiCall('supabase', 'set_cursor', async () => {
    const { error } = await supabase
      .from('sync_state')
      .upsert({
        source: 'notion_quick_capture',
        last_synced_at: timestamp,
        cursor_data: { timestamp },
        updated_at: new Date().toISOString()
      }, { onConflict: 'source' });
    
    if (error) throw error;
    logger.debug('Cursor updated', { timestamp });
  }, { operation: 'set_cursor', timestamp });
}

// Enhanced Notion query
async function getUpdatedPagesSince(sinceISO) {
  return await makeApiCall('notion', 'query_database', async () => {
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
    
    let response = await notion.databases.query({
      database_id: config.notion.databaseId,
      ...body
    });

    // Accumulate all pages if has_more using pagination
    const allResults = [...response.results];
    let next = response.has_more ? response.next_cursor : null;
    while (next) {
      const nextResp = await notion.databases.query({
        database_id: config.notion.databaseId,
        start_cursor: next,
        ...body
      });
      allResults.push(...nextResp.results);
      next = nextResp.has_more ? nextResp.next_cursor : null;
      await sleep(config.rateLimit.notionDelay);
    }
    
    logger.debug('Notion query complete', { 
      pages_returned: allResults.length,
      has_more: false,
      since: sinceISO 
    });
    
    return { results: allResults, has_more: false };
  }, { operation: 'query_pages', since: sinceISO });
}

// Enhanced task creation with transaction support
async function createTaskInSupabase(props, notionPageId, hash) {
  const operationId = metrics.startOperation('create_task', {
    entity_type: 'task',
    notion_page_id: notionPageId,
    area: props.area,
    priority: props.priority
  });

  try {
    if (flags.dryRun) {
      logger.info('Dry run: Would create task', { title: props.title, area: props.area });
      metrics.completeOperation(operationId, { dry_run: true });
      return { task_id: 'dry-run-id', created: true };
    }

    // Call the stored procedure with enhanced error context
    metrics.addOperationStep(operationId, 'call_rpc');
    const { data, error } = await supabase.rpc('create_or_update_task', {
      p_title: props.title,
      p_venture_name: props.venture || props.area,  // Use venture, fallback to area for compatibility
      p_project_name: props.project,
      p_milestone_name: props.milestone,
      p_priority: props.priority,
      p_due_date: props.dueDate,
      p_assignee: props.assignee,
      p_status: props.status,
      p_focus_slot: props.focusSlot,
      p_focus_date: props.focusDate,
      p_notion_page_id: notionPageId
    });
    
    if (error) {
      throw new Error(`RPC call failed: ${error.message} (${error.code})`);
    }
    
    metrics.addOperationStep(operationId, 'task_created', { task_id: data?.task_id });
    return metrics.completeOperation(operationId, { 
      task_id: data?.task_id, 
      created: data?.created,
      updated: data?.updated 
    });
    
  } catch (error) {
    return metrics.failOperation(operationId, error, {
      title: props.title,
      area: props.area,
      notion_page_id: notionPageId
    });
  }
}

// Enhanced Notion page update
async function updateNotionPage(pageId, taskId) {
  return await retryWithBackoff(async () => {
    if (flags.dryRun) {
      logger.debug('Dry run: Would update Notion page', { pageId, taskId });
      return;
    }
    
    return await makeApiCall('notion', 'update_page', async () => {
      await notion.pages.update({
        page_id: pageId,
        properties: {
          'Supabase Task ID': { rich_text: [{ text: { content: taskId } }] },
          'Linked': { checkbox: true }
        }
      });
    }, { operation: 'update_page', page_id: pageId, task_id: taskId });
    
    await sleep(config.rateLimit.notionDelay);
  }, config.retry.maxAttempts, { page_id: pageId, task_id: taskId });
}

// Enhanced sync check
async function needsSync(notionPageId, currentHash) {
  return await makeApiCall('supabase', 'check_sync_needed', async () => {
    const { data, error } = await supabase
      .from('integrations_notion')
      .select('external_hash')
      .eq('notion_page_id', notionPageId)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error;
    return !data || data.external_hash !== currentHash;
  }, { operation: 'check_sync', page_id: notionPageId });
}

// Main sync function with comprehensive metrics
async function syncPages() {
  // Generate correlation ID for this sync run
  const correlationId = logger.generateCorrelationId();
  const syncContext = {
    entity_type: 'sync',
    dry_run: flags.dryRun,
    correlation_id: correlationId
  };
  
  const syncOperationId = metrics.startOperation('sync_pages', syncContext);
  
  const startTime = Date.now();
  let created = 0, skipped = 0, errors = 0;
  
  try {
    logger.recordSyncStart();
    logger.info('Sync run starting', syncContext);
    
    // Get cursor and query pages
    metrics.addOperationStep(syncOperationId, 'get_cursor');
    const sinceISO = flags.since || await getCursor();
    
    metrics.addOperationStep(syncOperationId, 'query_notion', { since: sinceISO });
    const response = await getUpdatedPagesSince(sinceISO);
    const pages = response.results;
    
    if (pages.length === 0) {
      logger.info('No pages to sync');
      return metrics.completeOperation(syncOperationId, { 
        created: 0, skipped: 0, errors: 0, 
        pages_processed: 0 
      });
    }
    
    logger.info('Starting sync batch', { 
      pages_count: pages.length,
      since: sinceISO,
      dry_run: flags.dryRun
    });
    
    metrics.addOperationStep(syncOperationId, 'process_pages', { page_count: pages.length });
    
    // Process pages with detailed tracking
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const pageOperationId = metrics.startOperation('process_page', {
        entity_type: 'page',
        notion_page_id: page.id,
        page_number: i + 1,
        total_pages: pages.length
      });
      
      try {
        const props = extractProperties(page);
        const hash = calculateHash(page.properties);
        
        metrics.addOperationStep(pageOperationId, 'extract_properties', {
          title: props.title,
          area: props.area,
          priority: props.priority
        });
        
        // Skip validation - require Domain, Venture, AND Priority
        if (!props.domain) {
          logger.debug('Skipping page without domain', { 
            page_id: page.id, 
            title: props.title 
          });
          metrics.completeOperation(pageOperationId, { skipped: true, reason: 'missing_domain' });
          skipped++;
          continue;
        }
        
        if (!props.venture) {
          logger.debug('Skipping page without venture', { 
            page_id: page.id, 
            title: props.title,
            domain: props.domain 
          });
          metrics.completeOperation(pageOperationId, { skipped: true, reason: 'missing_venture' });
          skipped++;
          continue;
        }
        
        if (!props.priority) {
          logger.debug('Skipping page without priority', { 
            page_id: page.id, 
            title: props.title,
            domain: props.domain,
            venture: props.venture 
          });
          metrics.completeOperation(pageOperationId, { skipped: true, reason: 'missing_priority' });
          skipped++;
          continue;
        }
        
        if (props.linked && props.supabaseTaskId) {
          const needUpdate = await needsSync(page.id, hash);
          if (!needUpdate) {
            logger.debug('Page already synced', { page_id: page.id });
            metrics.completeOperation(pageOperationId, { skipped: true, reason: 'already_synced' });
            skipped++;
            continue;
          }
        }
        
        // Create/update task
        metrics.addOperationStep(pageOperationId, 'create_task');
        // Resolve focusSlot against DB just-in-time
        const normalizedFocusSlot = await mapFocusSlotAsync(props.focusSlot);
        const result = await createTaskInSupabase({ ...props, focusSlot: normalizedFocusSlot }, page.id, hash);
        
        if (result?.task_id) {
          // Update integration record
          metrics.addOperationStep(pageOperationId, 'update_integration');
          if (!flags.dryRun) {
            await makeApiCall('supabase', 'update_integration', async () => {
              await supabase
                .from('integrations_notion')
                .update({ 
                  external_hash: hash, 
                  last_seen_at: new Date().toISOString() 
                })
                .eq('notion_page_id', page.id);
            });
          }
          
          // Update Notion page
          metrics.addOperationStep(pageOperationId, 'update_notion_page');
          await updateNotionPage(page.id, result.task_id);
          
          logger.info('Task processed', { 
            title: props.title,
            task_id: result.task_id,
            area: props.area,
            priority: props.priority
          });
          
          metrics.completeOperation(pageOperationId, { 
            created: true, 
            task_id: result.task_id 
          });
          created++;
        }
        
        // Rate limiting and memory tracking
        await sleep(config.rateLimit.supabaseDelay);
        if (i % 10 === 0) metrics.recordMemoryUsage();
        
      } catch (error) {
        logger.error('Failed to process page', { 
          page_id: page.id,
          error: error.message,
          stack: error.stack
        });
        metrics.failOperation(pageOperationId, error);
        errors++;
      }
    }
    
    // Update cursor to the max last_edited_time across all processed pages
    if (pages.length > 0 && !flags.dryRun) {
      metrics.addOperationStep(syncOperationId, 'update_cursor');
      const latestTimestamp = pages
        .map(p => new Date(p.last_edited_time).getTime())
        .reduce((max, t) => Math.max(max, t), 0);
      await setCursor(new Date(latestTimestamp).toISOString());
    }
    
    const duration = Date.now() - startTime;
    logger.recordSyncComplete(created, skipped, errors);
    
    const summary = {
      ...syncContext,
      pages_processed: pages.length,
      tasks_created: created,
      pages_skipped: skipped,
      errors_count: errors,
      duration_ms: duration,
      duration_human: logger.formatDuration(duration),
      success_rate: pages.length > 0 ? Math.round(((created + skipped) / pages.length) * 100) + '%' : '100%'
    };
    
    logger.info('Sync run completed', summary);
    
    // Send Slack alert for any errors (per operator review feedback)
    if (errors > 0) {
      logger.warn('Sync run completed with errors', {
        ...summary,
        alert_reason: 'errors_detected',
        recommendation: errors > pages.length * 0.2 ? 'Check Notion API or database connectivity' : 'Monitor for patterns'
      });
    }
    
    return metrics.completeOperation(syncOperationId, summary);
    
  } catch (error) {
    logger.error('Sync failed completely', { 
      error: error.message,
      stack: error.stack,
      duration_ms: Date.now() - startTime
    });
    return metrics.failOperation(syncOperationId, error);
  }
}

// Health check server with management APIs
function startHealthCheckServer() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }
    
    try {
      if (url.pathname === '/health') {
        const health = logger.getHealthCheck();
        res.writeHead(health.status === 'healthy' ? 200 : 503);
        res.end(JSON.stringify(health, null, 2));
        
      } else if (url.pathname === '/metrics') {
        const metricsData = {
          ...logger.getHealthCheck(),
          performance: metrics.getPerformanceSummary(),
          active_operations: metrics.getActiveOperations()
        };
        res.writeHead(200);
        res.end(JSON.stringify(metricsData, null, 2));
        
      } else if (url.pathname === '/api/sync' && req.method === 'POST') {
        // Manual sync trigger
        logger.info('Manual sync triggered via API');
        syncPages().then(() => {
          res.writeHead(200);
          res.end(JSON.stringify({ status: 'sync_completed', timestamp: new Date().toISOString() }));
        }).catch(error => {
          res.writeHead(500);
          res.end(JSON.stringify({ error: error.message, timestamp: new Date().toISOString() }));
        });
        
      } else if (url.pathname === '/api/domains' && req.method === 'GET') {
        // Get all domains with ventures
        const { data: domains, error } = await supabase
          .from('domains')
          .select(`
            *,
            ventures:ventures(*)
          `);
          
        if (error) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: error.message }));
        } else {
          res.writeHead(200);
          res.end(JSON.stringify(domains, null, 2));
        }
        
      } else if (url.pathname === '/api/ventures' && req.method === 'GET') {
        // Get all ventures with projects
        const { data: ventures, error } = await supabase
          .from('ventures')
          .select(`
            *,
            domain:domains(*),
            projects:projects(*)
          `);
          
        if (error) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: error.message }));
        } else {
          res.writeHead(200);
          res.end(JSON.stringify(ventures, null, 2));
        }
        
      } else if (url.pathname === '/api/ventures' && req.method === 'POST') {
        // Create new venture
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            const { slug, name, description, domain_slug } = JSON.parse(body);
            
            // Find domain ID
            const { data: domain } = await supabase
              .from('domains')
              .select('id')
              .eq('slug', domain_slug)
              .single();
            
            if (!domain) {
              res.writeHead(400);
              res.end(JSON.stringify({ error: 'Domain not found' }));
              return;
            }
            
            const { data, error } = await supabase
              .from('ventures')
              .insert({ slug, name, description, primary_domain_id: domain.id })
              .select()
              .single();
              
            if (error) {
              res.writeHead(400);
              res.end(JSON.stringify({ error: error.message }));
            } else {
              res.writeHead(201);
              res.end(JSON.stringify(data));
            }
          } catch (parseError) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
          }
        });
        
      } else if (url.pathname === '/api/projects' && req.method === 'POST') {
        // Create new project
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            const { name, venture_slug, description } = JSON.parse(body);
            
            // Find venture ID if provided
            let venture_id = null;
            if (venture_slug) {
              const { data: venture } = await supabase
                .from('ventures')
                .select('id')
                .eq('slug', venture_slug)
                .single();
              
              if (!venture) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Venture not found' }));
                return;
              }
              venture_id = venture.id;
            }
            
            const { data, error } = await supabase
              .from('projects')
              .insert({ name, venture_id, description })
              .select()
              .single();
              
            if (error) {
              res.writeHead(400);
              res.end(JSON.stringify({ error: error.message }));
            } else {
              res.writeHead(201);
              res.end(JSON.stringify(data));
            }
          } catch (parseError) {
            res.writeHead(400);
            res.end(JSON.stringify({ error: 'Invalid JSON' }));
          }
        });
        
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
      }
      
    } catch (error) {
      logger.error('API error', { error: error.message, path: url.pathname });
      res.writeHead(500);
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  });
  
  server.listen(config.server.port, () => {
    logger.info('Health check server started', { 
      port: config.server.port,
      endpoints: ['/health', '/metrics', '/api/sync', '/api/domains', '/api/ventures', '/api/projects']
    });
  });
  
  return server;
}

// Main execution
async function main() {
  logger.info('QC Bridge Enhanced v2.1 starting', {
    mode: flags.once ? 'once' : 'continuous',
    dry_run: flags.dryRun,
    verbose: flags.verbose
  });
  
  let server;
  // Do not start the health server in one-off mode to avoid port conflicts
  if (config.server.enableHealthCheck && !flags.once) {
    server = startHealthCheckServer();
  }
  
  if (flags.once) {
    await syncPages();
  } else {
    // Continuous mode with health monitoring
    while (true) {
      try {
        await syncPages();
        logger.info('Waiting for next sync', { wait_seconds: 60 });
        await sleep(60000);
      } catch (error) {
        logger.fatal('Sync loop failed', { error: error.message });
        // Continue running for observability, but alert
        await sleep(30000); // Shorter retry on failure
      }
    }
  }
}

// Graceful shutdown
function shutdown(signal) {
  logger.info('Shutdown initiated', { signal });
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Unhandled errors
process.on('uncaughtException', (error) => {
  logger.fatal('Uncaught exception', { 
    error: error.message, 
    stack: error.stack 
  });
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.fatal('Unhandled promise rejection', { 
    reason: reason?.message || reason,
    promise: promise.toString()
  });
  process.exit(1);
});

// Run
main().catch(error => {
  logger.fatal('Main execution failed', { 
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});
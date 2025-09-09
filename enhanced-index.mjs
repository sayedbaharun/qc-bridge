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
  enableSlack: !flags.dryRun // Disable Slack in dry-run mode
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
    
    metrics.recordApiCall(service, endpoint, duration, true);
    metrics.completeOperation(operationId, { 
      success: true, 
      duration_ms: duration,
      response_size: JSON.stringify(result).length 
    });
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    metrics.recordApiCall(service, endpoint, duration, false);
    metrics.failOperation(operationId, error, { duration_ms: duration });
    throw error;
  }
}

// Helper: Calculate hash of Notion properties
function calculateHash(properties) {
  const relevant = {
    title: properties.Title?.title?.[0]?.plain_text || '',
    area: properties.Area?.select?.name?.toLowerCase() || '',
    project: properties.Project?.rich_text?.[0]?.plain_text || '',
    milestone: properties.Milestone?.rich_text?.[0]?.plain_text || '',
    priority: properties.Priority?.select?.name || '',
    due: properties.Due?.date?.start || '',
    assignee: properties.Assignee?.rich_text?.[0]?.plain_text || '',
    status: properties.Status?.select?.name || '',
    focusSlot: properties['Focus Slot']?.select?.name || '',
    focusDate: properties['Focus Date']?.date?.start || ''
  };
  return createHash('sha256').update(JSON.stringify(relevant)).digest('hex');
}

// Helper: Extract property values
function extractProperties(page) {
  const props = page.properties;
  return {
    title: props.Title?.title?.[0]?.plain_text || 'Untitled',
    area: props.Area?.select?.name?.toLowerCase() || null,
    project: props.Project?.rich_text?.[0]?.plain_text || null,
    milestone: props.Milestone?.rich_text?.[0]?.plain_text || null,
    priority: props.Priority?.select?.name || null,
    dueDate: props.Due?.date?.start || null,
    assignee: props.Assignee?.rich_text?.[0]?.plain_text || null,
    status: props.Status?.select?.name || null,
    focusSlot: props['Focus Slot']?.select?.name || null,
    focusDate: props['Focus Date']?.date?.start || null,
    supabaseTaskId: props['Supabase Task ID']?.rich_text?.[0]?.plain_text || null,
    linked: props['Linked ✅']?.checkbox || false
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
    
    const response = await notion.databases.query({
      database_id: config.notion.databaseId,
      ...body
    });
    
    logger.debug('Notion query complete', { 
      pages_returned: response.results.length,
      has_more: response.has_more,
      since: sinceISO 
    });
    
    return response;
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
      p_area: props.area,
      p_project_name: props.project,
      p_milestone_name: props.milestone,
      p_priority: props.priority,
      p_due_date: props.dueDate,
      p_assignee: props.assignee,
      p_status: props.status,
      p_focus_slot: props.focusSlot,
      p_focus_date: props.focusDate,
      p_notion_page_id: notionPageId,
      p_external_hash: hash
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
          'Linked ✅': { checkbox: true }
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
  const syncOperationId = metrics.startOperation('sync_pages', {
    entity_type: 'sync',
    dry_run: flags.dryRun
  });
  
  const startTime = Date.now();
  let created = 0, skipped = 0, errors = 0;
  
  try {
    logger.recordSyncStart();
    
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
        
        // Skip validation
        if (!props.area) {
          logger.debug('Skipping page without area', { 
            page_id: page.id, 
            title: props.title 
          });
          metrics.completeOperation(pageOperationId, { skipped: true, reason: 'no_area' });
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
        const result = await createTaskInSupabase(props, page.id, hash);
        
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
    
    // Update cursor
    if (pages.length > 0 && !flags.dryRun) {
      metrics.addOperationStep(syncOperationId, 'update_cursor');
      const latestTimestamp = pages[0].last_edited_time;
      await setCursor(latestTimestamp);
    }
    
    const duration = Date.now() - startTime;
    logger.recordSyncComplete(created, skipped, errors);
    
    const summary = {
      pages_processed: pages.length,
      tasks_created: created,
      pages_skipped: skipped,
      errors_count: errors,
      duration_ms: duration,
      success_rate: pages.length > 0 ? (created + skipped) / pages.length : 1
    };
    
    logger.info('Sync completed', summary);
    
    // Send alert if error rate is high
    if (errors > 0 && errors / pages.length > 0.2) {
      logger.warn('High error rate detected', {
        error_rate: Math.round((errors / pages.length) * 100) + '%',
        total_errors: errors,
        total_pages: pages.length
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

// Health check server
function startHealthCheckServer() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    
    res.setHeader('Content-Type', 'application/json');
    
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
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });
  
  server.listen(config.server.port, () => {
    logger.info('Health check server started', { port: config.server.port });
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
  if (config.server.enableHealthCheck) {
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
// Enhanced logger with structured logging and Slack alerts
import { createHash } from 'crypto';

export class EnhancedLogger {
  constructor(config = {}) {
    this.config = {
      level: config.level || 'info',
      notionAlertsDbId: config.notionAlertsDbId || process.env.NOTION_ALERTS_DATABASE_ID,
      notionToken: config.notionToken || process.env.NOTION_TOKEN,
      enableNotionAlerts: config.enableNotionAlerts !== false,
      serviceName: config.serviceName || 'qc-bridge',
      environment: config.environment || process.env.NODE_ENV || 'production',
      version: config.version || '2.0.0'
    };
    
    this.levels = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
      fatal: 4
    };
    
    this.metrics = {
      sync_runs: 0,
      tasks_created: 0,
      tasks_skipped: 0,
      errors_count: 0,
      notion_api_calls: 0,
      supabase_api_calls: 0,
      sync_duration_ms: 0,
      last_successful_sync: null,
      uptime_start: Date.now()
    };
  }

  shouldLog(level) {
    return this.levels[level] >= this.levels[this.config.level];
  }

  formatMessage(level, message, context = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      service: this.config.serviceName,
      version: this.config.version,
      environment: this.config.environment,
      message,
      ...context,
      // Add correlation ID for tracing
      correlation_id: context.correlation_id || this.generateCorrelationId()
    };

    // Add metrics snapshot for key events
    if (level === 'info' && (message.includes('Sync complete') || message.includes('starting'))) {
      logEntry.metrics = { ...this.metrics };
    }

    return logEntry;
  }

  generateCorrelationId() {
    return createHash('md5').update(`${Date.now()}-${Math.random()}`).digest('hex').substring(0, 8);
  }

  async sendToNotion(level, message, context = {}) {
    if (!this.config.enableNotionAlerts || !this.config.notionAlertsDbId) return;
    
    // Only send warn, error, fatal to Notion
    if (!['warn', 'error', 'fatal'].includes(level)) return;

    const emoji = {
      warn: '⚠️',
      error: '🚨',
      fatal: '💥'
    }[level] || 'ℹ️';

    const priority = {
      warn: '🟡 P2',
      error: '🔴 P1', 
      fatal: '🔴 P1'
    }[level];

    try {
      const { Client } = await import('@notionhq/client');
      const notion = new Client({ auth: this.config.notionToken });
      
      await notion.pages.create({
        parent: { database_id: this.config.notionAlertsDbId },
        properties: {
          'Title': {
            title: [{ text: { content: `${emoji} ${level.toUpperCase()}: ${message}` } }]
          },
          'Level': {
            select: { name: level.toUpperCase() }
          },
          'Priority': {
            select: { name: priority }
          },
          'Service': {
            rich_text: [{ text: { content: this.config.serviceName } }]
          },
          'Environment': {
            select: { name: this.config.environment }
          },
          'Error Details': {
            rich_text: [{ text: { content: JSON.stringify(context, null, 2) } }]
          },
          'Correlation ID': {
            rich_text: [{ text: { content: context.correlation_id || 'N/A' } }]
          },
          'Status': {
            select: { name: 'Open' }
          },
          'Created': {
            date: { start: new Date().toISOString() }
          }
        }
      });
      
    } catch (error) {
      console.error('Notion alert error:', error.message);
    }
  }

  debug(message, context = {}) {
    if (!this.shouldLog('debug')) return;
    const logEntry = this.formatMessage('debug', message, context);
    console.log(JSON.stringify(logEntry));
  }

  info(message, context = {}) {
    if (!this.shouldLog('info')) return;
    const logEntry = this.formatMessage('info', message, context);
    console.log(JSON.stringify(logEntry));
  }

  warn(message, context = {}) {
    if (!this.shouldLog('warn')) return;
    const logEntry = this.formatMessage('warn', message, context);
    console.warn(JSON.stringify(logEntry));
    this.sendToNotion('warn', message, context);
  }

  error(message, context = {}) {
    if (!this.shouldLog('error')) return;
    this.metrics.errors_count++;
    const logEntry = this.formatMessage('error', message, context);
    console.error(JSON.stringify(logEntry));
    this.sendToNotion('error', message, context);
  }

  fatal(message, context = {}) {
    this.metrics.errors_count++;
    const logEntry = this.formatMessage('fatal', message, context);
    console.error(JSON.stringify(logEntry));
    this.sendToNotion('fatal', message, context);
  }

  // Metrics methods
  incrementNotionApiCalls() {
    this.metrics.notion_api_calls++;
  }

  incrementSupabaseApiCalls() {
    this.metrics.supabase_api_calls++;
  }

  recordSyncStart() {
    this.metrics.sync_runs++;
    this.syncStartTime = Date.now();
  }

  recordSyncComplete(created, skipped, errors) {
    this.metrics.sync_duration_ms = Date.now() - this.syncStartTime;
    this.metrics.tasks_created += created;
    this.metrics.tasks_skipped += skipped;
    this.metrics.errors_count += errors;
    this.metrics.last_successful_sync = new Date().toISOString();
  }

  getHealthStatus() {
    const uptime = Date.now() - this.metrics.uptime_start;
    const errorRate = this.metrics.errors_count / Math.max(this.metrics.sync_runs, 1);
    const lastSyncAge = this.metrics.last_successful_sync ? 
      Date.now() - new Date(this.metrics.last_successful_sync).getTime() : null;

    return {
      status: this.determineHealthStatus(errorRate, lastSyncAge),
      uptime_ms: uptime,
      uptime_human: this.formatDuration(uptime),
      error_rate: Math.round(errorRate * 100) / 100,
      last_sync_age_ms: lastSyncAge,
      last_sync_age_human: lastSyncAge ? this.formatDuration(lastSyncAge) : 'never',
      metrics: { ...this.metrics }
    };
  }

  determineHealthStatus(errorRate, lastSyncAge) {
    if (errorRate > 0.3) return 'critical';
    if (lastSyncAge && lastSyncAge > 300000) return 'degraded'; // 5 minutes
    if (errorRate > 0.1) return 'warning';
    return 'healthy';
  }

  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  // Health check endpoint data
  getHealthCheck() {
    const health = this.getHealthStatus();
    return {
      service: this.config.serviceName,
      version: this.config.version,
      environment: this.config.environment,
      timestamp: new Date().toISOString(),
      ...health
    };
  }
}
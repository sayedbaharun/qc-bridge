// Metrics collector for operational insights
export class MetricsCollector {
  constructor(logger, supabase) {
    this.logger = logger;
    this.supabase = supabase;
    this.operationMetrics = new Map();
    this.performanceMetrics = {
      notion_response_times: [],
      supabase_response_times: [],
      sync_batch_sizes: [],
      memory_usage: []
    };
  }

  // Record operation start
  startOperation(operationType, context = {}) {
    const operationId = this.generateOperationId();
    const startTime = Date.now();
    
    this.operationMetrics.set(operationId, {
      type: operationType,
      startTime,
      context,
      steps: []
    });

    this.logger.debug('Operation started', {
      operation_id: operationId,
      operation_type: operationType,
      ...context
    });

    return operationId;
  }

  // Add step to operation
  addOperationStep(operationId, stepName, data = {}) {
    const operation = this.operationMetrics.get(operationId);
    if (!operation) return;

    operation.steps.push({
      name: stepName,
      timestamp: Date.now(),
      duration_from_start: Date.now() - operation.startTime,
      data
    });
  }

  // Complete operation
  completeOperation(operationId, result = {}) {
    const operation = this.operationMetrics.get(operationId);
    if (!operation) return;

    const duration = Date.now() - operation.startTime;
    const finalData = {
      operation_id: operationId,
      operation_type: operation.type,
      duration_ms: duration,
      total_steps: operation.steps.length,
      result_status: result.status || 'success',
      ...operation.context,
      ...result
    };

    // Log completion
    this.logger.info('Operation completed', finalData);

    // Record performance metrics
    this.recordPerformanceMetrics(operation.type, duration, result);

    // Store in ops_logs if table exists
    this.storeOperationLog(finalData, operation.steps);

    // Clean up
    this.operationMetrics.delete(operationId);

    return finalData;
  }

  // Fail operation
  failOperation(operationId, error, context = {}) {
    const operation = this.operationMetrics.get(operationId);
    if (!operation) return;

    const duration = Date.now() - operation.startTime;
    const errorData = {
      operation_id: operationId,
      operation_type: operation.type,
      duration_ms: duration,
      total_steps: operation.steps.length,
      result_status: 'error',
      error_message: error.message,
      error_code: error.code,
      error_stack: error.stack,
      ...operation.context,
      ...context
    };

    this.logger.error('Operation failed', errorData);
    
    // Store error in ops_logs
    this.storeOperationLog(errorData, operation.steps);
    
    this.operationMetrics.delete(operationId);
    return errorData;
  }

  // Record API call metrics
  recordApiCall(service, endpoint, duration, success = true) {
    const metricData = {
      service,
      endpoint,
      duration_ms: duration,
      success,
      timestamp: new Date().toISOString()
    };

    if (service === 'notion') {
      this.logger.incrementNotionApiCalls();
      this.performanceMetrics.notion_response_times.push(duration);
    } else if (service === 'supabase') {
      this.logger.incrementSupabaseApiCalls();
      this.performanceMetrics.supabase_response_times.push(duration);
    }

    // Keep only last 100 measurements for performance
    Object.keys(this.performanceMetrics).forEach(key => {
      if (Array.isArray(this.performanceMetrics[key]) && this.performanceMetrics[key].length > 100) {
        this.performanceMetrics[key] = this.performanceMetrics[key].slice(-100);
      }
    });

    this.logger.debug('API call recorded', metricData);
  }

  // Record memory usage
  recordMemoryUsage() {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const memUsage = process.memoryUsage();
      this.performanceMetrics.memory_usage.push({
        timestamp: Date.now(),
        heap_used: memUsage.heapUsed,
        heap_total: memUsage.heapTotal,
        external: memUsage.external,
        rss: memUsage.rss
      });

      // Keep only last 50 measurements
      if (this.performanceMetrics.memory_usage.length > 50) {
        this.performanceMetrics.memory_usage = this.performanceMetrics.memory_usage.slice(-50);
      }
    }
  }

  // Get performance summary
  getPerformanceSummary() {
    const notionTimes = this.performanceMetrics.notion_response_times;
    const supabaseTimes = this.performanceMetrics.supabase_response_times;
    const memoryUsage = this.performanceMetrics.memory_usage;

    return {
      api_performance: {
        notion: this.calculateStats(notionTimes),
        supabase: this.calculateStats(supabaseTimes)
      },
      memory: {
        current: memoryUsage[memoryUsage.length - 1] || null,
        trend: this.calculateMemoryTrend()
      },
      sync_performance: {
        average_batch_size: this.calculateAverage(this.performanceMetrics.sync_batch_sizes),
        batch_count: this.performanceMetrics.sync_batch_sizes.length
      }
    };
  }

  calculateStats(values) {
    if (!values || values.length === 0) return null;
    
    const sorted = [...values].sort((a, b) => a - b);
    return {
      count: values.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: this.calculateAverage(values),
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }

  calculateAverage(values) {
    if (!values || values.length === 0) return 0;
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  }

  calculateMemoryTrend() {
    const usage = this.performanceMetrics.memory_usage;
    if (usage.length < 2) return 'stable';

    const recent = usage.slice(-10);
    const older = usage.slice(-20, -10);
    
    if (older.length === 0) return 'stable';

    const recentAvg = this.calculateAverage(recent.map(u => u.heap_used));
    const olderAvg = this.calculateAverage(older.map(u => u.heap_used));
    
    const change = (recentAvg - olderAvg) / olderAvg;
    
    if (change > 0.1) return 'increasing';
    if (change < -0.1) return 'decreasing';
    return 'stable';
  }

  // Store operation in database (if ops_logs table exists)
  async storeOperationLog(operationData, steps = []) {
    try {
      const logEntry = {
        operation: operationData.operation_type,
        entity_type: operationData.entity_type || 'system',
        entity_id: operationData.entity_id || null,
        metadata: {
          duration_ms: operationData.duration_ms,
          result_status: operationData.result_status,
          steps: steps.map(step => ({
            name: step.name,
            duration_from_start: step.duration_from_start,
            data: step.data
          })),
          ...operationData
        },
        created_by: 'qc-bridge',
        created_at: new Date().toISOString()
      };

      const { error } = await this.supabase
        .from('ops_logs')
        .insert(logEntry);

      if (error && !error.message.includes('does not exist')) {
        this.logger.warn('Failed to store operation log', { error: error.message });
      }
    } catch (error) {
      // Silently ignore if ops_logs table doesn't exist
      this.logger.debug('Could not store operation log', { error: error.message });
    }
  }

  generateOperationId() {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  recordPerformanceMetrics(operationType, duration, result) {
    if (operationType === 'sync_batch') {
      this.performanceMetrics.sync_batch_sizes.push(result.batch_size || 0);
    }
  }

  // Get current active operations (for debugging)
  getActiveOperations() {
    return Array.from(this.operationMetrics.entries()).map(([id, op]) => ({
      operation_id: id,
      type: op.type,
      duration_ms: Date.now() - op.startTime,
      steps_completed: op.steps.length,
      context: op.context
    }));
  }
}
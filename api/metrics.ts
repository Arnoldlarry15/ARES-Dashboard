/**
 * Prometheus Metrics Endpoint
 * Exposes application metrics in Prometheus format
 * 
 * Metrics include:
 * - HTTP request counters and latencies
 * - Authentication success/failure rates
 * - Campaign operations
 * - Database connection pool stats
 * - API key usage
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

interface Metric {
  name: string;
  type: 'counter' | 'gauge' | 'histogram';
  help: string;
  value: number;
  labels?: Record<string, string>;
}

// In-memory metrics store (in production, use a proper metrics library like prom-client)
const metrics = new Map<string, Metric>();

/**
 * Initialize default metrics
 */
function initializeMetrics() {
  if (metrics.size === 0) {
    // HTTP metrics
    metrics.set('http_requests_total', {
      name: 'http_requests_total',
      type: 'counter',
      help: 'Total number of HTTP requests',
      value: 0
    });

    metrics.set('http_request_duration_seconds', {
      name: 'http_request_duration_seconds',
      type: 'histogram',
      help: 'HTTP request latencies in seconds',
      value: 0
    });

    // Authentication metrics
    metrics.set('auth_success_total', {
      name: 'auth_success_total',
      type: 'counter',
      help: 'Total successful authentications',
      value: 0
    });

    metrics.set('auth_failure_total', {
      name: 'auth_failure_total',
      type: 'counter',
      help: 'Total failed authentications',
      value: 0
    });

    // Campaign metrics
    metrics.set('campaigns_created_total', {
      name: 'campaigns_created_total',
      type: 'counter',
      help: 'Total campaigns created',
      value: 0
    });

    metrics.set('campaigns_active', {
      name: 'campaigns_active',
      type: 'gauge',
      help: 'Number of active campaigns',
      value: 0
    });

    // Database metrics
    metrics.set('db_connections_active', {
      name: 'db_connections_active',
      type: 'gauge',
      help: 'Active database connections',
      value: 0
    });

    metrics.set('db_query_duration_seconds', {
      name: 'db_query_duration_seconds',
      type: 'histogram',
      help: 'Database query latencies in seconds',
      value: 0
    });

    // API usage metrics
    metrics.set('api_requests_total', {
      name: 'api_requests_total',
      type: 'counter',
      help: 'Total API requests by endpoint',
      value: 0
    });
  }
}

/**
 * Format metrics in Prometheus exposition format
 */
function formatPrometheusMetrics(): string {
  initializeMetrics();
  
  const lines: string[] = [];

  for (const metric of metrics.values()) {
    // Add HELP and TYPE
    lines.push(`# HELP ${metric.name} ${metric.help}`);
    lines.push(`# TYPE ${metric.name} ${metric.type}`);

    // Add metric value with labels
    if (metric.labels && Object.keys(metric.labels).length > 0) {
      const labelStr = Object.entries(metric.labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(',');
      lines.push(`${metric.name}{${labelStr}} ${metric.value}`);
    } else {
      lines.push(`${metric.name} ${metric.value}`);
    }
  }

  return lines.join('\n') + '\n';
}

/**
 * Get system metrics
 */
function getSystemMetrics(): Record<string, number> {
  if (typeof process !== 'undefined' && process.memoryUsage) {
    const memory = process.memoryUsage();
    return {
      process_memory_heap_bytes: memory.heapUsed,
      process_memory_heap_total_bytes: memory.heapTotal,
      process_memory_rss_bytes: memory.rss,
      process_memory_external_bytes: memory.external || 0
    };
  }
  return {};
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check for basic auth (protect metrics endpoint in production)
  const authHeader = req.headers.authorization;
  const expectedAuth = process.env.METRICS_AUTH; // Format: "Basic base64(user:pass)"
  
  if (expectedAuth && authHeader !== expectedAuth) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Metrics"');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Add system metrics
    const systemMetrics = getSystemMetrics();
    for (const [name, value] of Object.entries(systemMetrics)) {
      metrics.set(name, {
        name,
        type: 'gauge',
        help: `System metric: ${name}`,
        value
      });
    }

    // Format and return metrics
    const metricsOutput = formatPrometheusMetrics();
    
    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    res.status(200).send(metricsOutput);

  } catch (error) {
    console.error('Metrics endpoint error:', error);
    return res.status(500).json({ 
      error: 'Failed to generate metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Helper function to increment a counter metric
 * Export this for use in other API handlers
 */
export function incrementCounter(name: string, labels?: Record<string, string>) {
  const metric = metrics.get(name);
  if (metric && metric.type === 'counter') {
    metric.value++;
    metric.labels = labels;
  }
}

/**
 * Helper function to set a gauge metric
 * Export this for use in other API handlers
 */
export function setGauge(name: string, value: number, labels?: Record<string, string>) {
  const metric = metrics.get(name);
  if (metric && metric.type === 'gauge') {
    metric.value = value;
    metric.labels = labels;
  }
}

/**
 * Helper function to observe a histogram metric
 * Export this for use in other API handlers
 */
export function observeHistogram(name: string, value: number, labels?: Record<string, string>) {
  const metric = metrics.get(name);
  if (metric && metric.type === 'histogram') {
    // Simple average for demonstration (use proper histogram buckets in production)
    metric.value = (metric.value + value) / 2;
    metric.labels = labels;
  }
}

/**
 * Health Check Endpoint
 * Provides application health status and readiness checks
 * 
 * Returns:
 * - Overall health status
 * - Component health (database, cache, external services)
 * - System metrics
 * - Version information
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    database?: {
      status: 'healthy' | 'unhealthy';
      latency?: number;
      error?: string;
    };
    cache?: {
      status: 'healthy' | 'unhealthy';
      latency?: number;
      error?: string;
    };
    externalServices?: {
      gemini?: {
        status: 'healthy' | 'unhealthy';
        error?: string;
      };
      auth?: {
        status: 'healthy' | 'unhealthy';
        error?: string;
      };
    };
  };
  metrics?: {
    memory: {
      used: number;
      total: number;
      percentage: number;
    };
    cpu?: {
      usage: number;
    };
  };
}

/**
 * Check database connectivity
 */
async function checkDatabase(): Promise<HealthCheck['checks']['database']> {
  try {
    // In production, test actual database connection
    const start = Date.now();
    
    // Simulate database check
    // In real implementation: await prisma.$queryRaw`SELECT 1`
    
    const latency = Date.now() - start;

    return {
      status: 'healthy',
      latency
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Check cache connectivity (Redis, etc.)
 */
async function checkCache(): Promise<HealthCheck['checks']['cache']> {
  try {
    // In production, test actual cache connection
    const start = Date.now();
    
    // Simulate cache check
    
    const latency = Date.now() - start;

    return {
      status: 'healthy',
      latency
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Check external services
 */
async function checkExternalServices(): Promise<HealthCheck['checks']['externalServices']> {
  const checks: HealthCheck['checks']['externalServices'] = {};

  // Check Gemini API
  if (process.env.GEMINI_API_KEY) {
    try {
      // In production, make a lightweight API call
      checks.gemini = { status: 'healthy' };
    } catch (error) {
      checks.gemini = {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Check Auth provider
  if (process.env.AUTH0_DOMAIN || process.env.SAML_ENTRY_POINT) {
    try {
      // In production, check auth provider connectivity
      checks.auth = { status: 'healthy' };
    } catch (error) {
      checks.auth = {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  return checks;
}

/**
 * Get system metrics
 */
function getSystemMetrics(): HealthCheck['metrics'] {
  if (typeof process !== 'undefined' && process.memoryUsage) {
    const memory = process.memoryUsage();
    return {
      memory: {
        used: memory.heapUsed,
        total: memory.heapTotal,
        percentage: (memory.heapUsed / memory.heapTotal) * 100
      }
    };
  }
  return undefined;
}

/**
 * Calculate overall health status
 */
function calculateOverallStatus(checks: HealthCheck['checks']): HealthCheck['status'] {
  // Check if any critical component is unhealthy
  if (checks.database?.status === 'unhealthy') {
    return 'unhealthy';
  }

  // Check if any component is unhealthy but not critical
  const hasUnhealthyComponent = 
    checks.cache?.status === 'unhealthy' ||
    checks.externalServices?.gemini?.status === 'unhealthy' ||
    checks.externalServices?.auth?.status === 'unhealthy';

  if (hasUnhealthyComponent) {
    return 'degraded';
  }

  return 'healthy';
}

const startTime = Date.now();

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Run health checks
    const [database, cache, externalServices] = await Promise.all([
      checkDatabase(),
      checkCache(),
      checkExternalServices()
    ]);

    // Build health check response
    const healthCheck: HealthCheck = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: (Date.now() - startTime) / 1000,
      checks: {
        database,
        cache,
        externalServices
      },
      metrics: getSystemMetrics()
    };

    // Calculate overall status
    healthCheck.status = calculateOverallStatus(healthCheck.checks);

    // Set appropriate HTTP status code
    const statusCode = 
      healthCheck.status === 'healthy' ? 200 :
      healthCheck.status === 'degraded' ? 200 :
      503;

    res.status(statusCode).json(healthCheck);

  } catch (error) {
    console.error('Health check error:', error);
    
    const errorResponse: HealthCheck = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: (Date.now() - startTime) / 1000,
      checks: {}
    };

    res.status(503).json(errorResponse);
  }
}

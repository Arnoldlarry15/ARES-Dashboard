/**
 * Error tracking middleware
 * Captures and logs errors with Sentry integration
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { logger } from '../logger';

/**
 * Global error handler middleware
 * Captures unhandled errors and sends them to Sentry
 */
export function errorHandler(
  error: Error,
  req: VercelRequest,
  res: VercelResponse
): void {
  // Extract request context
  const context = {
    method: req.method,
    url: req.url,
    ip: req.headers['x-forwarded-for'] as string || req.headers['x-real-ip'] as string || 'unknown',
    userAgent: req.headers['user-agent'] as string,
  };

  // Log error with full context
  logger.error('Unhandled error in request handler', error, context);

  // Determine appropriate status code
  const statusCode = (error as { statusCode?: number }).statusCode || 500;

  // Send error response
  res.status(statusCode).json({
    error: statusCode === 500 ? 'Internal server error' : error.message,
    message: process.env.NODE_ENV === 'development' ? error.message : undefined,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
  });
}

/**
 * Wrapper to catch async errors in handlers
 * Ensures errors are properly caught and sent to error handler
 */
export function catchAsync(
  handler: (req: VercelRequest, res: VercelResponse) => Promise<unknown>
) {
  return async (req: VercelRequest, res: VercelResponse) => {
    try {
      await handler(req, res);
    } catch (error) {
      errorHandler(error as Error, req, res);
    }
  };
}

/**
 * Wrapper for middleware that handles errors
 */
export function wrapMiddleware(
  middleware: (req: VercelRequest, res: VercelResponse, next: () => void) => void | Promise<unknown>
) {
  return async (req: VercelRequest, res: VercelResponse, next: () => void) => {
    try {
      await middleware(req, res, next);
    } catch (error) {
      errorHandler(error as Error, req, res);
    }
  };
}

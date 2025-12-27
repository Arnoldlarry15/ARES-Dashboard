import type { VercelRequest, VercelResponse } from '@vercel/node';

// Simple in-memory rate limiter (for serverless, consider using Redis in production)
// NOTE: This in-memory implementation is suitable for single-instance deployments.
// For production serverless with multiple instances, use Redis:
//   - npm install @upstash/redis
//   - const redis = new Redis({ url: process.env.REDIS_URL, token: process.env.REDIS_TOKEN })
//   - Store rate limit data in Redis instead of local memory
interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const rateLimitStore: RateLimitStore = {};

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  Object.keys(rateLimitStore).forEach(key => {
    if (rateLimitStore[key].resetTime < now) {
      delete rateLimitStore[key];
    }
  });
}, 60000); // Clean every minute

export interface RateLimitConfig {
  windowMs?: number; // Time window in milliseconds
  maxRequests?: number; // Max requests per window
  message?: string; // Custom error message
  keyGenerator?: (req: VercelRequest) => string; // Custom key generator
}

export function rateLimit(config: RateLimitConfig = {}) {
  const {
    windowMs = 60000, // 1 minute default
    maxRequests = 60, // 60 requests per minute default
    message = 'Too many requests, please try again later.',
    keyGenerator = (req) => {
      // Default: use IP address as key
      return req.headers['x-forwarded-for'] as string || 
             req.headers['x-real-ip'] as string || 
             'unknown';
    }
  } = config;

  return (req: VercelRequest, res: VercelResponse, next: () => void) => {
    const key = keyGenerator(req);
    const now = Date.now();
    
    // Get or create rate limit entry
    if (!rateLimitStore[key] || rateLimitStore[key].resetTime < now) {
      rateLimitStore[key] = {
        count: 0,
        resetTime: now + windowMs
      };
    }

    // Increment request count
    rateLimitStore[key].count++;

    // Check if limit exceeded
    if (rateLimitStore[key].count > maxRequests) {
      res.setHeader('Retry-After', Math.ceil((rateLimitStore[key].resetTime - now) / 1000));
      res.setHeader('X-RateLimit-Limit', maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader('X-RateLimit-Reset', rateLimitStore[key].resetTime.toString());
      
      return res.status(429).json({
        error: 'Too Many Requests',
        message,
        retryAfter: Math.ceil((rateLimitStore[key].resetTime - now) / 1000)
      });
    }

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', (maxRequests - rateLimitStore[key].count).toString());
    res.setHeader('X-RateLimit-Reset', rateLimitStore[key].resetTime.toString());

    next();
  };
}

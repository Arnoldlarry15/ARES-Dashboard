import type { VercelRequest, VercelResponse } from '@vercel/node';

// Security headers middleware
export function securityHeaders(req: VercelRequest, res: VercelResponse, next: () => void) {
  // Prevent MIME type sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // XSS Protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer Policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Content Security Policy (adjust as needed)
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'");
  
  // Permissions Policy
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  next();
}

// CORS configuration
export interface CorsConfig {
  origin?: string | string[] | ((origin: string) => boolean);
  methods?: string[];
  allowedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
}

export function cors(config: CorsConfig = {}) {
  const {
    origin = '*',
    methods = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders = ['Content-Type', 'Authorization'],
    credentials = false,
    maxAge = 86400 // 24 hours
  } = config;

  return (req: VercelRequest, res: VercelResponse, next: () => void) => {
    const requestOrigin = req.headers.origin as string;

    // Determine allowed origin
    let allowedOrigin = '*';
    if (typeof origin === 'string') {
      allowedOrigin = origin;
    } else if (Array.isArray(origin)) {
      if (requestOrigin && origin.includes(requestOrigin)) {
        allowedOrigin = requestOrigin;
      }
    } else if (typeof origin === 'function') {
      if (requestOrigin && origin(requestOrigin)) {
        allowedOrigin = requestOrigin;
      }
    }

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', methods.join(', '));
    res.setHeader('Access-Control-Allow-Headers', allowedHeaders.join(', '));
    
    if (credentials) {
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    
    res.setHeader('Access-Control-Max-Age', maxAge.toString());

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    next();
  };
}

// CSRF Protection (simple token-based)
export function csrfProtection(req: VercelRequest, res: VercelResponse, next: () => void) {
  // Skip CSRF for GET, HEAD, OPTIONS
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method || '')) {
    return next();
  }

  const csrfToken = req.headers['x-csrf-token'] as string;

  // In production, validate against stored token
  // For demo purposes, we'll skip strict validation
  if (!csrfToken && req.method !== 'OPTIONS') {
    console.warn('CSRF token missing');
  }

  next();
}

// Request logging middleware
export function requestLogger(req: VercelRequest, res: VercelResponse, next: () => void) {
  const start = Date.now();
  const ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown';
  
  console.log({
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
    ip,
    userAgent: req.headers['user-agent']
  });

  // Log response
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    const duration = Date.now() - start;
    console.log({
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`
    });
    return originalJson(body);
  };

  next();
}

// Compose multiple middleware functions
export function compose(...middlewares: Array<(req: VercelRequest, res: VercelResponse, next: () => void) => void>) {
  return (req: VercelRequest, res: VercelResponse, handler: () => void | Promise<void>) => {
    let index = 0;

    const next = () => {
      if (index < middlewares.length) {
        const middleware = middlewares[index++];
        middleware(req, res, next);
      } else {
        handler();
      }
    };

    next();
  };
}

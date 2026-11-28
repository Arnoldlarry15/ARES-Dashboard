import { isIP } from 'node:net';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { logger } from '../logger';
import { verifyCsrfToken } from '../../services/auth/jwt';
import type { AuthenticatedRequest } from './auth';

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

  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  
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
    allowedHeaders = ['Content-Type', 'Authorization', 'X-CSRF-Token'],
    credentials = false,
    maxAge = 86400 // 24 hours
  } = config;

  return (req: VercelRequest, res: VercelResponse, next: () => void) => {
    const requestOrigin = req.headers.origin as string | undefined;

    // Determine allowed origin (never fall back to '*' when an allowlist/function is configured)
    let allowedOrigin: string | null = null;
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

    // Never pair wildcard '*' with Access-Control-Allow-Credentials: true
    if (allowedOrigin && !(credentials && allowedOrigin === '*')) {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      if (allowedOrigin !== '*') {
        res.setHeader('Vary', 'Origin');
      }
      if (credentials) {
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      }
    }

    res.setHeader('Access-Control-Allow-Methods', methods.join(', '));
    res.setHeader('Access-Control-Allow-Headers', allowedHeaders.join(', '));
    res.setHeader('Access-Control-Max-Age', maxAge.toString());

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    next();
  };
}

// Session-bound CSRF Protection for cookie-authenticated mutations
export function csrfProtection(req: AuthenticatedRequest, res: VercelResponse, next: () => void) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method || '')) {
    return next();
  }

  // Bearer token requests are immune to CSRF
  if (req.authMethod === 'bearer') {
    return next();
  }

  const cookieHeader = req.headers.cookie as string | undefined;
  const csrfCookieMatch =
    cookieHeader?.match(/(?:^|;\s*)__Host-csrf_token=([^;]+)/) ||
    cookieHeader?.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  const csrfCookie = csrfCookieMatch?.[1] || '';
  const csrfHeader = (req.headers['x-csrf-token'] as string | undefined) || '';
  const sessionJti = req.user?.jti || '';

  if (!verifyCsrfToken(csrfCookie, csrfHeader, sessionJti)) {
    logger.warn('CSRF validation failed', {
      method: req.method,
      url: req.url,
    });
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid or missing CSRF token',
    });
  }

  next();
}

function parseIpList(value: string | string[] | undefined): string[] {
  if (!value) {
    return [];
  }
  const raw = Array.isArray(value) ? value.join(',') : value;
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function getTrustedProxyHops(): number {
  const raw = process.env.TRUSTED_PROXY_HOPS;
  if (!raw) {
    return 1;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }
  return parsed;
}

function extractValidIp(candidate: string | undefined): string | undefined {
  if (!candidate) {
    return undefined;
  }
  const trimmed = candidate.trim();
  return isIP(trimmed) !== 0 ? trimmed : undefined;
}

/**
 * Extracts the client IP address.
 * Proxy headers are only trusted when TRUST_PROXY === 'true'.
 * - `x-vercel-forwarded-for` is only read when running on Vercel (`VERCEL === '1'`).
 * - `x-forwarded-for` is parsed from the right using `TRUSTED_PROXY_HOPS` (default 1).
 * - `x-real-ip` is used as a fallback when `x-forwarded-for` is absent.
 * - All candidate IPs and `req.socket?.remoteAddress` are validated with `net.isIP`.
 */
export function getClientIp(req: VercelRequest): string {
  if (process.env.TRUST_PROXY === 'true') {
    if (process.env.VERCEL === '1') {
      const vercelIps = parseIpList(req.headers?.['x-vercel-forwarded-for']);
      if (vercelIps.length > 0) {
        const validVercelIp = extractValidIp(vercelIps[0]);
        if (validVercelIp) {
          return validVercelIp;
        }
      }
    }

    const xffIps = parseIpList(req.headers?.['x-forwarded-for']);
    if (xffIps.length > 0) {
      const trustedHops = getTrustedProxyHops();
      const targetIndex = Math.max(0, xffIps.length - trustedHops);
      const validXffIp = extractValidIp(xffIps[targetIndex]);
      if (validXffIp) {
        return validXffIp;
      }
    }

    const realIpList = parseIpList(req.headers?.['x-real-ip']);
    if (realIpList.length > 0) {
      const validRealIp = extractValidIp(realIpList[0]);
      if (validRealIp) {
        return validRealIp;
      }
    }
  }

  return extractValidIp(req.socket?.remoteAddress) || 'unknown';
}

// Request logging middleware
export function requestLogger(req: VercelRequest, res: VercelResponse, next: () => void) {
  const start = Date.now();
  const ip = getClientIp(req);
  
  // Log incoming request
  logger.info('Incoming request', {
    method: req.method,
    url: req.url,
    ip,
    userAgent: req.headers['user-agent'] as string,
  });

  // Log response
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    const duration = Date.now() - start;
    logger.logRequest(
      req.method || 'UNKNOWN',
      req.url || '',
      res.statusCode,
      duration,
      { ip }
    );
    return originalJson(body);
  };

  next();
}

// Compose multiple middleware functions (supports sync and async middlewares)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function compose(...middlewares: Array<(req: any, res: VercelResponse, next: () => void | Promise<void>) => unknown>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (req: any, res: VercelResponse, handler: () => void | Promise<void>) => {
    let index = 0;

    const run = async (): Promise<void> => {
      if (index < middlewares.length) {
        const middleware = middlewares[index++];
        let downstreamPromise: Promise<void> | undefined;
        const next = () => {
          downstreamPromise = run();
          return downstreamPromise;
        };
        await middleware(req, res, next);
        if (downstreamPromise) {
          await downstreamPromise;
        }
      } else {
        await handler();
      }
    };

    await run();
  };
}

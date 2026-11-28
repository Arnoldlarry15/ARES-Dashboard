import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  rateLimit,
  limiter,
  MAX_NAMESPACE_ENTRIES,
  MAX_RATE_LIMIT_ENTRIES,
  getRateLimitStoreSize,
  resetRateLimitStore,
} from '../../lib/middleware/rateLimit';
import { getClientIp } from '../../lib/middleware/security';

function createMockRes() {
  const setHeaderSpy = vi.fn();
  const statusSpy = vi.fn().mockReturnThis();
  const jsonSpy = vi.fn();
  const res = {
    setHeader: setHeaderSpy as unknown as VercelResponse['setHeader'],
    status: statusSpy as unknown as VercelResponse['status'],
    json: jsonSpy as unknown as VercelResponse['json'],
  } as Partial<VercelResponse>;
  return { res, setHeaderSpy, statusSpy, jsonSpy };
}

describe('Rate Limiting Middleware', () => {
  const originalEnv = { ...process.env };
  let mockReq: Partial<VercelRequest>;
  let mockRes: Partial<VercelResponse>;
  let nextFn: () => void;
  let setHeaderSpy: ReturnType<typeof vi.fn>;
  let statusSpy: ReturnType<typeof vi.fn>;
  let jsonSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitStore();
    process.env.TRUST_PROXY = 'true';

    ({ res: mockRes, setHeaderSpy, statusSpy, jsonSpy } = createMockRes());

    mockReq = {
      headers: {
        'x-forwarded-for': '192.168.1.1',
      },
      socket: { remoteAddress: '127.0.0.1' } as VercelRequest['socket'],
      method: 'GET',
      url: '/api/test',
    };

    nextFn = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env = { ...originalEnv };
  });

  describe('rateLimit()', () => {
    it('should allow request within rate limit', () => {
      const middleware = rateLimit({ windowMs: 60000, maxRequests: 10 });

      middleware(mockReq as VercelRequest, mockRes as VercelResponse, nextFn);

      expect(nextFn).toHaveBeenCalledOnce();
      expect(setHeaderSpy).toHaveBeenCalledWith('X-RateLimit-Limit', '10');
      expect(setHeaderSpy).toHaveBeenCalledWith('X-RateLimit-Remaining', '9');
      expect(statusSpy).not.toHaveBeenCalled();
    });

    it('should block request when rate limit exceeded', () => {
      const middleware = rateLimit({ windowMs: 60000, maxRequests: 2 });

      middleware(mockReq as VercelRequest, mockRes as VercelResponse, nextFn);
      middleware(mockReq as VercelRequest, mockRes as VercelResponse, nextFn);

      // This should be blocked
      middleware(mockReq as VercelRequest, mockRes as VercelResponse, nextFn);

      expect(statusSpy).toHaveBeenCalledWith(429);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Too Many Requests',
          retryAfter: expect.any(Number),
        })
      );
    });

    it('should set rate limit headers', () => {
      mockReq.headers = { 'x-forwarded-for': '10.0.0.50' };
      const middleware = rateLimit({ windowMs: 60000, maxRequests: 100 });

      middleware(mockReq as VercelRequest, mockRes as VercelResponse, nextFn);

      expect(setHeaderSpy).toHaveBeenCalledWith('X-RateLimit-Limit', '100');
      expect(setHeaderSpy).toHaveBeenCalledWith('X-RateLimit-Remaining', '99');
      expect(setHeaderSpy).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));
    });

    it('should use custom key generator', () => {
      const customKeyGen = vi.fn().mockReturnValue('custom-key');
      const middleware = rateLimit({
        windowMs: 60000,
        maxRequests: 5,
        keyGenerator: customKeyGen,
      });

      middleware(mockReq as VercelRequest, mockRes as VercelResponse, nextFn);

      expect(customKeyGen).toHaveBeenCalledWith(mockReq);
      expect(nextFn).toHaveBeenCalled();
    });

    it('should reset count after time window (including exact resetTime === now boundary)', () => {
      mockReq.headers = { 'x-forwarded-for': '10.0.0.99' };
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

      const middleware = rateLimit({ windowMs: 1000, maxRequests: 2 });

      middleware(mockReq as VercelRequest, mockRes as VercelResponse, nextFn);
      expect(nextFn).toHaveBeenCalledTimes(1);

      middleware(mockReq as VercelRequest, mockRes as VercelResponse, nextFn);
      expect(nextFn).toHaveBeenCalledTimes(2);

      // Third request should be blocked
      middleware(mockReq as VercelRequest, mockRes as VercelResponse, nextFn);
      expect(statusSpy).toHaveBeenCalledWith(429);

      // Advance time to exact resetTime boundary (resetTime <= now)
      vi.advanceTimersByTime(1000);

      statusSpy.mockClear();
      nextFn = vi.fn();

      // Fourth request should succeed (new window)
      middleware(mockReq as VercelRequest, mockRes as VercelResponse, nextFn);
      expect(nextFn).toHaveBeenCalled();
      expect(statusSpy).not.toHaveBeenCalledWith(429);
    });

    it('should use default configuration', () => {
      const middleware = rateLimit();

      middleware(mockReq as VercelRequest, mockRes as VercelResponse, nextFn);

      expect(nextFn).toHaveBeenCalled();
      expect(setHeaderSpy).toHaveBeenCalledWith('X-RateLimit-Limit', '60');
    });

    it('should handle different IPs separately', () => {
      const middleware = rateLimit({ windowMs: 60000, maxRequests: 1 });

      mockReq.headers = { 'x-forwarded-for': '10.0.0.201' };
      middleware(mockReq as VercelRequest, mockRes as VercelResponse, nextFn);
      expect(nextFn).toHaveBeenCalledOnce();

      nextFn = vi.fn();
      middleware(mockReq as VercelRequest, mockRes as VercelResponse, nextFn);
      expect(statusSpy).toHaveBeenCalledWith(429);

      statusSpy.mockClear();
      nextFn = vi.fn();
      mockReq.headers = { 'x-forwarded-for': '10.0.0.202' };
      middleware(mockReq as VercelRequest, mockRes as VercelResponse, nextFn);
      expect(nextFn).toHaveBeenCalled();
      expect(statusSpy).not.toHaveBeenCalledWith(429);
    });

    it('should use x-real-ip header as fallback when TRUST_PROXY is true', () => {
      const middleware = rateLimit({ windowMs: 60000, maxRequests: 5 });

      mockReq.headers = { 'x-real-ip': '10.0.0.1' };
      middleware(mockReq as VercelRequest, mockRes as VercelResponse, nextFn);

      expect(nextFn).toHaveBeenCalled();
    });

    it('should handle unknown IP', () => {
      const middleware = rateLimit({ windowMs: 60000, maxRequests: 5 });

      mockReq.headers = {};
      mockReq.socket = {} as VercelRequest['socket'];
      middleware(mockReq as VercelRequest, mockRes as VercelResponse, nextFn);

      expect(nextFn).toHaveBeenCalled();
    });

    it('should include Retry-After header when rate limited', () => {
      const middleware = rateLimit({ windowMs: 60000, maxRequests: 1 });

      middleware(mockReq as VercelRequest, mockRes as VercelResponse, nextFn);
      middleware(mockReq as VercelRequest, mockRes as VercelResponse, nextFn);

      expect(setHeaderSpy).toHaveBeenCalledWith('Retry-After', expect.any(Number));
    });
  });

  describe('endpoint namespacing (keyPrefix & path fallback)', () => {
    it('isolates counters for the same IP across different explicit keyPrefix namespaces', () => {
      const loginLimit = rateLimit({ windowMs: 60_000, maxRequests: 1, keyPrefix: 'auth-login' });
      const callbackLimit = rateLimit({ windowMs: 60_000, maxRequests: 1, keyPrefix: 'auth-callback' });

      mockReq.headers = { 'x-forwarded-for': '203.0.113.10' };
      mockReq.url = '/api/shared-url';

      loginLimit(mockReq as VercelRequest, mockRes as VercelResponse, nextFn);
      expect(nextFn).toHaveBeenCalledTimes(1);

      // Same IP, different keyPrefix should still be allowed
      const next2 = vi.fn();
      const res2 = createMockRes();
      callbackLimit(mockReq as VercelRequest, res2.res as VercelResponse, next2);
      expect(next2).toHaveBeenCalledTimes(1);
      expect(res2.statusSpy).not.toHaveBeenCalled();

      // Same IP, same keyPrefix ('auth-login') should be blocked
      const next3 = vi.fn();
      const res3 = createMockRes();
      loginLimit(mockReq as VercelRequest, res3.res as VercelResponse, next3);
      expect(next3).not.toHaveBeenCalled();
      expect(res3.statusSpy).toHaveBeenCalledWith(429);
    });

    it('falls back to normalized request path (ignoring query string) when keyPrefix is omitted', () => {
      const sharedLimiter = rateLimit({ windowMs: 60_000, maxRequests: 1 });
      mockReq.headers = { 'x-forwarded-for': '203.0.113.20' };

      // First request to /api/campaigns?page=1
      mockReq.url = '/api/campaigns?page=1';
      sharedLimiter(mockReq as VercelRequest, mockRes as VercelResponse, nextFn);
      expect(nextFn).toHaveBeenCalledTimes(1);

      // Second request to /api/campaigns?page=2 shares the /api/campaigns namespace and is blocked
      const nextSamePath = vi.fn();
      const resSamePath = createMockRes();
      mockReq.url = '/api/campaigns?page=2';
      sharedLimiter(mockReq as VercelRequest, resSamePath.res as VercelResponse, nextSamePath);
      expect(nextSamePath).not.toHaveBeenCalled();
      expect(resSamePath.statusSpy).toHaveBeenCalledWith(429);

      // Request to /api/audit-logs is isolated in its own path namespace
      const nextOtherPath = vi.fn();
      const resOtherPath = createMockRes();
      mockReq.url = '/api/audit-logs?skip=0';
      sharedLimiter(mockReq as VercelRequest, resOtherPath.res as VercelResponse, nextOtherPath);
      expect(nextOtherPath).toHaveBeenCalledTimes(1);
      expect(resOtherPath.statusSpy).not.toHaveBeenCalled();
    });
  });

  describe('trusted proxy header enforcement', () => {
    it('ignores x-forwarded-for, x-real-ip, and x-vercel-forwarded-for when TRUST_PROXY is unset', () => {
      delete process.env.TRUST_PROXY;
      const middleware = rateLimit({ windowMs: 60_000, maxRequests: 1, keyPrefix: 'proxy-unset' });
      mockReq.socket = { remoteAddress: '198.51.100.77' } as VercelRequest['socket'];

      mockReq.headers = {
        'x-forwarded-for': '203.0.113.1',
        'x-real-ip': '203.0.113.2',
        'x-vercel-forwarded-for': '203.0.113.3',
      };
      middleware(mockReq as VercelRequest, mockRes as VercelResponse, nextFn);
      expect(nextFn).toHaveBeenCalledOnce();

      // Attacker rotates all forwarding headers, but socket IP is unchanged -> still blocked
      const next2 = vi.fn();
      const res2 = createMockRes();
      mockReq.headers = {
        'x-forwarded-for': '192.0.2.10',
        'x-real-ip': '192.0.2.11',
        'x-vercel-forwarded-for': '192.0.2.12',
      };
      middleware(mockReq as VercelRequest, res2.res as VercelResponse, next2);
      expect(res2.statusSpy).toHaveBeenCalledWith(429);
      expect(next2).not.toHaveBeenCalled();
    });

    it('ignores forwarding headers when TRUST_PROXY is "false"', () => {
      process.env.TRUST_PROXY = 'false';
      const middleware = rateLimit({ windowMs: 60_000, maxRequests: 1, keyPrefix: 'proxy-false' });
      mockReq.socket = { remoteAddress: '198.51.100.88' } as VercelRequest['socket'];

      mockReq.headers = { 'x-vercel-forwarded-for': '203.0.113.50' };
      middleware(mockReq as VercelRequest, mockRes as VercelResponse, nextFn);
      expect(nextFn).toHaveBeenCalledOnce();

      const next2 = vi.fn();
      const res2 = createMockRes();
      mockReq.headers = { 'x-vercel-forwarded-for': '203.0.113.51' };
      middleware(mockReq as VercelRequest, res2.res as VercelResponse, next2);
      expect(res2.statusSpy).toHaveBeenCalledWith(429);
      expect(next2).not.toHaveBeenCalled();
    });

    it('uses trusted x-vercel-forwarded-for only when TRUST_PROXY is "true" and VERCEL is "1"', () => {
      process.env.TRUST_PROXY = 'true';
      process.env.VERCEL = '1';
      const middleware = rateLimit({ windowMs: 60_000, maxRequests: 1, keyPrefix: 'proxy-true' });
      mockReq.socket = { remoteAddress: '127.0.0.1' } as VercelRequest['socket'];

      mockReq.headers = { 'x-vercel-forwarded-for': '203.0.113.60, 10.0.0.1' };
      middleware(mockReq as VercelRequest, mockRes as VercelResponse, nextFn);
      expect(nextFn).toHaveBeenCalledOnce();

      // Different client IP behind trusted proxy gets its own bucket
      const next2 = vi.fn();
      const res2 = createMockRes();
      mockReq.headers = { 'x-vercel-forwarded-for': '203.0.113.61, 10.0.0.1' };
      middleware(mockReq as VercelRequest, res2.res as VercelResponse, next2);
      expect(next2).toHaveBeenCalledOnce();
      expect(res2.statusSpy).not.toHaveBeenCalled();
    });
  });

  describe('limiter (default export)', () => {
    it('should be configured with 60 requests per minute', () => {
      limiter(mockReq as VercelRequest, mockRes as VercelResponse, nextFn);

      expect(nextFn).toHaveBeenCalled();
      expect(setHeaderSpy).toHaveBeenCalledWith('X-RateLimit-Limit', '60');
    });

    it('should match problem statement configuration', () => {
      mockReq.headers = { 'x-forwarded-for': '10.0.0.250' };

      for (let i = 0; i < 60; i++) {
        nextFn = vi.fn();
        setHeaderSpy.mockClear();
        statusSpy.mockClear();
        jsonSpy.mockClear();

        limiter(mockReq as VercelRequest, mockRes as VercelResponse, nextFn);
        expect(nextFn).toHaveBeenCalled();
      }

      nextFn = vi.fn();
      limiter(mockReq as VercelRequest, mockRes as VercelResponse, nextFn);
      expect(statusSpy).toHaveBeenCalledWith(429);
      expect(nextFn).not.toHaveBeenCalled();
    });
  });

  describe('capacity exhaustion, namespace isolation & anti-eviction integrity (RL-1)', () => {
    it('bounds a flooded namespace at MAX_NAMESPACE_ENTRIES by evicting oldest non-blocked entries so legitimate users still succeed', () => {
      const middleware = rateLimit({
        windowMs: 60_000,
        maxRequests: 5,
        keyPrefix: 'cap-test',
        keyGenerator: (req) => String(req.headers['x-flood-key'] || 'default'),
      });

      // Flood 10,000 unique non-blocked keys into a single namespace
      for (let i = 0; i < MAX_RATE_LIMIT_ENTRIES; i++) {
        mockReq.headers = { 'x-flood-key': `flood-key-${i}` };
        const next = vi.fn();
        const res = createMockRes();
        middleware(mockReq as VercelRequest, res.res as VercelResponse, next);
        expect(next).toHaveBeenCalledOnce();
      }

      // Namespace size is bounded at MAX_NAMESPACE_ENTRIES
      expect(getRateLimitStoreSize('cap-test')).toBe(MAX_NAMESPACE_ENTRIES);

      // A new legitimate user in the same namespace is still admitted
      mockReq.headers = { 'x-flood-key': 'legitimate-new-user' };
      const legitNext = vi.fn();
      const legitRes = createMockRes();
      middleware(mockReq as VercelRequest, legitRes.res as VercelResponse, legitNext);
      expect(legitNext).toHaveBeenCalledOnce();
      expect(legitRes.statusSpy).not.toHaveBeenCalled();
      expect(getRateLimitStoreSize('cap-test')).toBe(MAX_NAMESPACE_ENTRIES);
    });

    it('sheds new unknown keys with 429 only when ALL entries in that namespace are actively blocked', () => {
      const middleware = rateLimit({
        windowMs: 60_000,
        maxRequests: 1,
        keyPrefix: 'all-blocked-ns',
        keyGenerator: (req) => String(req.headers['x-flood-key'] || 'default'),
      });

      // Fill exact namespace capacity with actively blocked entries (2 requests each > maxRequests 1)
      for (let i = 0; i < MAX_NAMESPACE_ENTRIES; i++) {
        mockReq.headers = { 'x-flood-key': `blocked-key-${i}` };
        middleware(mockReq as VercelRequest, createMockRes().res as VercelResponse, vi.fn());
        middleware(mockReq as VercelRequest, createMockRes().res as VercelResponse, vi.fn());
      }

      expect(getRateLimitStoreSize('all-blocked-ns')).toBe(MAX_NAMESPACE_ENTRIES);

      // New unknown keys in this 100%-blocked namespace are shed with 429 + Retry-After
      for (let i = 0; i < 20; i++) {
        mockReq.headers = { 'x-flood-key': `overflow-key-${i}` };
        const next = vi.fn();
        const res = createMockRes();
        middleware(mockReq as VercelRequest, res.res as VercelResponse, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.statusSpy).toHaveBeenCalledWith(429);
        expect(res.setHeaderSpy).toHaveBeenCalledWith('Retry-After', expect.any(Number));
        expect(res.setHeaderSpy).toHaveBeenCalledWith('X-RateLimit-Limit', '1');
        expect(res.setHeaderSpy).toHaveBeenCalledWith('X-RateLimit-Remaining', '0');
        expect(res.setHeaderSpy).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));
      }

      expect(getRateLimitStoreSize('all-blocked-ns')).toBe(MAX_NAMESPACE_ENTRIES);
    });

    it('prevents cross-endpoint capacity exhaustion: flooding /api/auth/login does NOT deny /api/campaigns or /api/users', () => {
      const loginLimiter = rateLimit({
        windowMs: 60_000,
        maxRequests: 1,
        keyPrefix: '/api/auth/login',
        keyGenerator: (req) => String(req.headers['x-flood-key'] || 'default'),
      });
      const campaignsLimiter = rateLimit({
        windowMs: 60_000,
        maxRequests: 5,
        keyPrefix: '/api/campaigns',
        keyGenerator: (req) => String(req.headers['x-flood-key'] || 'default'),
      });
      const usersLimiter = rateLimit({
        windowMs: 60_000,
        maxRequests: 5,
        keyPrefix: '/api/users',
        keyGenerator: (req) => String(req.headers['x-flood-key'] || 'default'),
      });

      // Attacker fills /api/auth/login to 100% blocked capacity + 10,000 overflow attempts
      for (let i = 0; i < MAX_NAMESPACE_ENTRIES; i++) {
        mockReq.headers = { 'x-flood-key': `attacker-login-${i}` };
        loginLimiter(mockReq as VercelRequest, createMockRes().res as VercelResponse, vi.fn());
        loginLimiter(mockReq as VercelRequest, createMockRes().res as VercelResponse, vi.fn());
      }
      for (let i = 0; i < MAX_RATE_LIMIT_ENTRIES; i++) {
        mockReq.headers = { 'x-flood-key': `attacker-overflow-${i}` };
        loginLimiter(mockReq as VercelRequest, createMockRes().res as VercelResponse, vi.fn());
      }

      // Unrelated endpoints remain completely unaffected for legitimate users
      mockReq.headers = { 'x-flood-key': 'legit-user-1' };
      const campNext = vi.fn();
      const campRes = createMockRes();
      campaignsLimiter(mockReq as VercelRequest, campRes.res as VercelResponse, campNext);
      expect(campNext).toHaveBeenCalledOnce();
      expect(campRes.statusSpy).not.toHaveBeenCalled();

      const usersNext = vi.fn();
      const usersRes = createMockRes();
      usersLimiter(mockReq as VercelRequest, usersRes.res as VercelResponse, usersNext);
      expect(usersNext).toHaveBeenCalledOnce();
      expect(usersRes.statusSpy).not.toHaveBeenCalled();
    });

    it('cannot evict or reset an actively blocked user by flooding MAX_NAMESPACE_ENTRIES + extra distinct keys', () => {
      const middleware = rateLimit({
        windowMs: 60_000,
        maxRequests: 2,
        keyPrefix: 'anti-evict',
        keyGenerator: (req) => String(req.headers['x-flood-key'] || 'default'),
      });

      // Attacker gets blocked on their own key
      mockReq.headers = { 'x-flood-key': 'attacker-blocked' };
      middleware(mockReq as VercelRequest, mockRes as VercelResponse, vi.fn());
      middleware(mockReq as VercelRequest, mockRes as VercelResponse, vi.fn());
      const blockedRes = createMockRes();
      const blockedNext = vi.fn();
      middleware(mockReq as VercelRequest, blockedRes.res as VercelResponse, blockedNext);
      expect(blockedNext).not.toHaveBeenCalled();
      expect(blockedRes.statusSpy).toHaveBeenCalledWith(429);

      // Attacker floods the remaining capacity + 500 extra keys
      for (let i = 0; i < MAX_NAMESPACE_ENTRIES + 500; i++) {
        mockReq.headers = { 'x-flood-key': `sybil-${i}` };
        middleware(mockReq as VercelRequest, createMockRes().res as VercelResponse, vi.fn());
      }

      expect(getRateLimitStoreSize('anti-evict')).toBe(MAX_NAMESPACE_ENTRIES);

      // Attacker retries their original blocked key — MUST still be blocked!
      mockReq.headers = { 'x-flood-key': 'attacker-blocked' };
      const retryRes = createMockRes();
      const retryNext = vi.fn();
      middleware(mockReq as VercelRequest, retryRes.res as VercelResponse, retryNext);
      expect(retryNext).not.toHaveBeenCalled();
      expect(retryRes.statusSpy).toHaveBeenCalledWith(429);
    });

    it('preserves existing active users ability to use remaining quota even when namespace has blocked entries', () => {
      const middleware = rateLimit({
        windowMs: 60_000,
        maxRequests: 3,
        keyPrefix: 'active-preserve',
        keyGenerator: (req) => String(req.headers['x-flood-key'] || 'default'),
      });

      // Legitimate user uses 1 of 3 requests
      mockReq.headers = { 'x-flood-key': 'legit-user' };
      middleware(mockReq as VercelRequest, createMockRes().res as VercelResponse, vi.fn());

      // Attacker fills remaining capacity with blocked entries so legit-user is the only non-blocked entry
      // Wait: legit-user is non-blocked, so if attacker floods with non-blocked keys, oldest non-blocked is evicted.
      // Instead, test that when namespace is filled with blocked entries (up to MAX_NAMESPACE_ENTRIES - 1),
      // existing active user keeps their quota and 4th request is blocked.
      for (let i = 0; i < MAX_NAMESPACE_ENTRIES - 1; i++) {
        mockReq.headers = { 'x-flood-key': `blocked-flood-${i}` };
        for (let r = 0; r < 4; r++) {
          middleware(mockReq as VercelRequest, createMockRes().res as VercelResponse, vi.fn());
        }
      }

      // Legitimate user's 2nd and 3rd requests still succeed, 4th is blocked
      mockReq.headers = { 'x-flood-key': 'legit-user' };
      const next2 = vi.fn();
      middleware(mockReq as VercelRequest, createMockRes().res as VercelResponse, next2);
      expect(next2).toHaveBeenCalledOnce();

      const next3 = vi.fn();
      middleware(mockReq as VercelRequest, createMockRes().res as VercelResponse, next3);
      expect(next3).toHaveBeenCalledOnce();

      const next4 = vi.fn();
      const res4 = createMockRes();
      middleware(mockReq as VercelRequest, res4.res as VercelResponse, next4);
      expect(next4).not.toHaveBeenCalled();
      expect(res4.statusSpy).toHaveBeenCalledWith(429);
    });

    it('sweeps expired entries in bounded batches and admits new keys once entries expire', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

      const shortWindow = rateLimit({
        windowMs: 5_000,
        maxRequests: 1,
        keyPrefix: 'expire-sweep',
        keyGenerator: (req) => String(req.headers['x-flood-key'] || 'default'),
      });

      // Fill namespace to capacity with blocked entries
      for (let i = 0; i < MAX_NAMESPACE_ENTRIES; i++) {
        mockReq.headers = { 'x-flood-key': `temp-${i}` };
        shortWindow(mockReq as VercelRequest, createMockRes().res as VercelResponse, vi.fn());
        shortWindow(mockReq as VercelRequest, createMockRes().res as VercelResponse, vi.fn());
      }
      expect(getRateLimitStoreSize('expire-sweep')).toBe(MAX_NAMESPACE_ENTRIES);

      // Before expiry: new key is shed because all entries are blocked
      mockReq.headers = { 'x-flood-key': 'new-key-before-expiry' };
      const resBefore = createMockRes();
      const nextBefore = vi.fn();
      shortWindow(mockReq as VercelRequest, resBefore.res as VercelResponse, nextBefore);
      expect(nextBefore).not.toHaveBeenCalled();
      expect(resBefore.statusSpy).toHaveBeenCalledWith(429);

      // Advance past windowMs
      vi.advanceTimersByTime(5_000);

      // New key triggers bounded expiry sweep and is admitted
      mockReq.headers = { 'x-flood-key': 'new-key-after-expiry' };
      const resAfter = createMockRes();
      const nextAfter = vi.fn();
      shortWindow(mockReq as VercelRequest, resAfter.res as VercelResponse, nextAfter);
      expect(nextAfter).toHaveBeenCalledOnce();
      expect(resAfter.statusSpy).not.toHaveBeenCalled();
      // Bounded sweep of K=64 removes 64 expired entries and inserts 1 new entry
      expect(getRateLimitStoreSize('expire-sweep')).toBe(MAX_NAMESPACE_ENTRIES - 64 + 1);
    });

    it('enforces exact limit under concurrent requests', async () => {
      const middleware = rateLimit({
        windowMs: 60_000,
        maxRequests: 5,
        keyPrefix: 'concurrent-test',
      });
      mockReq.headers = { 'x-forwarded-for': '198.51.100.200' };

      const results = await Promise.all(
        Array.from({ length: 12 }, () =>
          new Promise<{ allowed: boolean; status?: number }>((resolve) => {
            const { res, statusSpy: sSpy } = createMockRes();
            sSpy.mockImplementation((code: number) => {
              resolve({ allowed: false, status: code });
              return res;
            });
            middleware(mockReq as VercelRequest, res as VercelResponse, () => {
              resolve({ allowed: true });
            });
          })
        )
      );

      const allowedCount = results.filter((r) => r.allowed).length;
      const blockedCount = results.filter((r) => !r.allowed && r.status === 429).length;
      expect(allowedCount).toBe(5);
      expect(blockedCount).toBe(7);
    });
  });

  describe('getClientIp proxy chain & validation (RL-2 & RL-3)', () => {
    it('ignores leftmost spoofed IP in x-forwarded-for and selects rightmost trusted hop (default hops=1)', () => {
      process.env.TRUST_PROXY = 'true';
      delete process.env.TRUSTED_PROXY_HOPS;
      delete process.env.VERCEL;

      const req = {
        headers: {
          'x-forwarded-for': '1.2.3.4, 203.0.113.60',
        },
        socket: { remoteAddress: '10.0.0.1' },
      } as unknown as VercelRequest;

      expect(getClientIp(req)).toBe('203.0.113.60');
    });

    it('parses multiple trusted proxy hops when TRUSTED_PROXY_HOPS=2', () => {
      process.env.TRUST_PROXY = 'true';
      process.env.TRUSTED_PROXY_HOPS = '2';
      delete process.env.VERCEL;

      const req = {
        headers: {
          // Client spoofed 1.2.3.4; CDN appended 203.0.113.60; Nginx appended 10.0.0.5
          'x-forwarded-for': '1.2.3.4, 203.0.113.60, 10.0.0.5',
        },
        socket: { remoteAddress: '127.0.0.1' },
      } as unknown as VercelRequest;

      expect(getClientIp(req)).toBe('203.0.113.60');
    });

    it('ignores forged x-vercel-forwarded-for when VERCEL is unset, and honors it when VERCEL=1', () => {
      process.env.TRUST_PROXY = 'true';
      delete process.env.VERCEL;

      const req = {
        headers: {
          'x-vercel-forwarded-for': '198.51.100.99',
          'x-forwarded-for': '203.0.113.77',
        },
        socket: { remoteAddress: '10.0.0.1' },
      } as unknown as VercelRequest;

      // Outside Vercel: x-vercel-forwarded-for MUST be ignored
      expect(getClientIp(req)).toBe('203.0.113.77');

      // Inside Vercel: x-vercel-forwarded-for is honored
      process.env.VERCEL = '1';
      expect(getClientIp(req)).toBe('198.51.100.99');
    });

    it('rejects malformed/invalid IPv4 and IPv6 candidates and falls back to socket.remoteAddress or unknown', () => {
      process.env.TRUST_PROXY = 'true';
      delete process.env.VERCEL;

      const badXffReq = {
        headers: {
          'x-forwarded-for': '999.999.999.999, not-an-ip',
          'x-real-ip': '192.0.2.44:8080', // port suffix is not a valid IP
        },
        socket: { remoteAddress: '198.51.100.10' },
      } as unknown as VercelRequest;
      expect(getClientIp(badXffReq)).toBe('198.51.100.10');

      const allBadReq = {
        headers: {
          'x-forwarded-for': '<script>alert(1)</script>',
        },
        socket: { remoteAddress: 'invalid-socket' },
      } as unknown as VercelRequest;
      expect(getClientIp(allBadReq)).toBe('unknown');
    });

    it('accepts valid IPv6 addresses from trusted proxy headers', () => {
      process.env.TRUST_PROXY = 'true';
      delete process.env.VERCEL;

      const ipv6Req = {
        headers: {
          'x-forwarded-for': '2001:db8::1',
        },
        socket: { remoteAddress: '::1' },
      } as unknown as VercelRequest;
      expect(getClientIp(ipv6Req)).toBe('2001:db8::1');
    });

    it('ignores all proxy headers when TRUST_PROXY is disabled', () => {
      process.env.TRUST_PROXY = 'false';
      process.env.VERCEL = '1';

      const req = {
        headers: {
          'x-vercel-forwarded-for': '198.51.100.99',
          'x-forwarded-for': '203.0.113.77',
          'x-real-ip': '203.0.113.88',
        },
        socket: { remoteAddress: '10.0.0.2' },
      } as unknown as VercelRequest;
      expect(getClientIp(req)).toBe('10.0.0.2');
    });
  });
});

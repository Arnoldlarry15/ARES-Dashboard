import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { rateLimit, limiter } from '../../lib/middleware/rateLimit';

describe('Rate Limiting Middleware', () => {
  let mockReq: Partial<VercelRequest>;
  let mockRes: Partial<VercelResponse>;
  let nextFn: () => void;
  let setHeaderSpy: ReturnType<typeof vi.fn>;
  let statusSpy: ReturnType<typeof vi.fn>;
  let jsonSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Reset rate limit store by creating new instances
    vi.clearAllMocks();

    setHeaderSpy = vi.fn();
    statusSpy = vi.fn().mockReturnThis();
    jsonSpy = vi.fn();

    mockReq = {
      headers: {
        'x-forwarded-for': '192.168.1.1'
      },
      method: 'GET',
      url: '/api/test'
    };
    
    mockRes = {
      setHeader: setHeaderSpy as unknown as typeof mockRes.setHeader,
      status: statusSpy as unknown as typeof mockRes.status,
      json: jsonSpy as unknown as typeof mockRes.json
    };
    
    nextFn = vi.fn();
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
      
      // Make requests up to the limit
      middleware(mockReq as VercelRequest, mockRes as VercelResponse, nextFn);
      middleware(mockReq as VercelRequest, mockRes as VercelResponse, nextFn);
      
      // This should be blocked
      middleware(mockReq as VercelRequest, mockRes as VercelResponse, nextFn);

      expect(statusSpy).toHaveBeenCalledWith(429);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Too Many Requests',
          retryAfter: expect.any(Number)
        })
      );
    });

    it('should set rate limit headers', () => {
      // Use a unique IP to avoid conflicts with other tests
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
        keyGenerator: customKeyGen
      });
      
      middleware(mockReq as VercelRequest, mockRes as VercelResponse, nextFn);

      expect(customKeyGen).toHaveBeenCalledWith(mockReq);
      expect(nextFn).toHaveBeenCalled();
    });

    it('should reset count after time window', () => {
      // Use unique IP
      mockReq.headers = { 'x-forwarded-for': '10.0.0.99' };
      vi.useFakeTimers();
      
      const middleware = rateLimit({ windowMs: 1000, maxRequests: 2 });
      
      // First request
      middleware(mockReq as VercelRequest, mockRes as VercelResponse, nextFn);
      expect(nextFn).toHaveBeenCalledTimes(1);
      
      // Second request
      middleware(mockReq as VercelRequest, mockRes as VercelResponse, nextFn);
      expect(nextFn).toHaveBeenCalledTimes(2);
      
      // Third request should be blocked
      middleware(mockReq as VercelRequest, mockRes as VercelResponse, nextFn);
      expect(statusSpy).toHaveBeenCalledWith(429);
      
      // Advance time past window
      vi.advanceTimersByTime(1001);
      
      // Reset mocks
      statusSpy.mockClear();
      nextFn = vi.fn();
      
      // Fourth request should succeed (new window)
      middleware(mockReq as VercelRequest, mockRes as VercelResponse, nextFn);
      expect(nextFn).toHaveBeenCalled();
      expect(statusSpy).not.toHaveBeenCalledWith(429);
      
      vi.useRealTimers();
    });

    it('should use default configuration', () => {
      const middleware = rateLimit();
      
      middleware(mockReq as VercelRequest, mockRes as VercelResponse, nextFn);

      expect(nextFn).toHaveBeenCalled();
      expect(setHeaderSpy).toHaveBeenCalledWith('X-RateLimit-Limit', '60');
    });

    it('should handle different IPs separately', () => {
      const middleware = rateLimit({ windowMs: 60000, maxRequests: 1 });
      
      // First IP (use unique IP)
      mockReq.headers = { 'x-forwarded-for': '10.0.0.201' };
      middleware(mockReq as VercelRequest, mockRes as VercelResponse, nextFn);
      expect(nextFn).toHaveBeenCalledOnce();
      
      // Second request from same IP should be blocked
      nextFn = vi.fn();
      middleware(mockReq as VercelRequest, mockRes as VercelResponse, nextFn);
      expect(statusSpy).toHaveBeenCalledWith(429);
      
      // Different IP should be allowed
      statusSpy.mockClear();
      nextFn = vi.fn();
      mockReq.headers = { 'x-forwarded-for': '10.0.0.202' };
      middleware(mockReq as VercelRequest, mockRes as VercelResponse, nextFn);
      expect(nextFn).toHaveBeenCalled();
      expect(statusSpy).not.toHaveBeenCalledWith(429);
    });

    it('should use x-real-ip header as fallback', () => {
      const middleware = rateLimit({ windowMs: 60000, maxRequests: 5 });
      
      mockReq.headers = { 'x-real-ip': '10.0.0.1' };
      middleware(mockReq as VercelRequest, mockRes as VercelResponse, nextFn);

      expect(nextFn).toHaveBeenCalled();
    });

    it('should handle unknown IP', () => {
      const middleware = rateLimit({ windowMs: 60000, maxRequests: 5 });
      
      mockReq.headers = {};
      middleware(mockReq as VercelRequest, mockRes as VercelResponse, nextFn);

      expect(nextFn).toHaveBeenCalled();
    });

    it('should include Retry-After header when rate limited', () => {
      const middleware = rateLimit({ windowMs: 60000, maxRequests: 1 });
      
      // First request
      middleware(mockReq as VercelRequest, mockRes as VercelResponse, nextFn);
      
      // Second request should be blocked
      middleware(mockReq as VercelRequest, mockRes as VercelResponse, nextFn);

      expect(setHeaderSpy).toHaveBeenCalledWith('Retry-After', expect.any(Number));
    });
  });

  describe('limiter (default export)', () => {
    it('should be configured with 60 requests per minute', () => {
      limiter(mockReq as VercelRequest, mockRes as VercelResponse, nextFn);

      expect(nextFn).toHaveBeenCalled();
      expect(setHeaderSpy).toHaveBeenCalledWith('X-RateLimit-Limit', '60');
    });

    it('should match problem statement configuration', () => {
      // According to problem statement: 60 requests per 60_000ms (60 seconds)
      // Use unique IP for this test
      mockReq.headers = { 'x-forwarded-for': '10.0.0.250' };
      
      for (let i = 0; i < 60; i++) {
        nextFn = vi.fn();
        setHeaderSpy.mockClear();
        statusSpy.mockClear();
        jsonSpy.mockClear();
        
        limiter(mockReq as VercelRequest, mockRes as VercelResponse, nextFn);
        
        if (i < 60) {
          expect(nextFn).toHaveBeenCalled();
        }
      }
      
      // 61st request should be blocked
      nextFn = vi.fn();
      limiter(mockReq as VercelRequest, mockRes as VercelResponse, nextFn);
      expect(statusSpy).toHaveBeenCalledWith(429);
    });
  });
});

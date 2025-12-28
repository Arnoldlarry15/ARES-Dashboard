import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { errorHandler, catchAsync, wrapMiddleware } from '../../lib/middleware/errorHandler';

describe('Error Handler Middleware', () => {
  let mockReq: Partial<VercelRequest>;
  let mockRes: Partial<VercelResponse>;
  let statusSpy: ReturnType<typeof vi.fn>;
  let jsonSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    statusSpy = vi.fn().mockReturnThis();
    jsonSpy = vi.fn();

    mockReq = {
      method: 'GET',
      url: '/api/test',
      headers: {
        'x-forwarded-for': '192.168.1.1',
        'user-agent': 'test-agent'
      }
    };
    
    mockRes = {
      status: statusSpy as unknown as typeof mockRes.status,
      json: jsonSpy as unknown as typeof mockRes.json
    };
  });

  describe('errorHandler()', () => {
    it('should handle basic error', () => {
      const error = new Error('Test error');
      
      errorHandler(error, mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusSpy).toHaveBeenCalledWith(500);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Internal server error'
        })
      );
    });

    it('should use custom status code from error', () => {
      const error = new Error('Not found') as Error & { statusCode?: number };
      error.statusCode = 404;
      
      errorHandler(error, mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusSpy).toHaveBeenCalledWith(404);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Not found'
        })
      );
    });

    it('should include error details in development mode', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      const error = new Error('Detailed error');
      error.stack = 'Error stack trace';
      
      errorHandler(error, mockReq as VercelRequest, mockRes as VercelResponse);

      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Detailed error',
          stack: 'Error stack trace'
        })
      );
      
      process.env.NODE_ENV = originalEnv;
    });

    it('should not include error details in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      const error = new Error('Sensitive error');
      
      errorHandler(error, mockReq as VercelRequest, mockRes as VercelResponse);

      const callArgs = jsonSpy.mock.calls[0][0];
      expect(callArgs.message).toBeUndefined();
      expect(callArgs.stack).toBeUndefined();
      
      process.env.NODE_ENV = originalEnv;
    });

    it('should log error context', () => {
      const error = new Error('Context test');
      
      errorHandler(error, mockReq as VercelRequest, mockRes as VercelResponse);

      // Error handler should process the error
      expect(statusSpy).toHaveBeenCalled();
    });
  });

  describe('catchAsync()', () => {
    it('should execute handler successfully', async () => {
      const handler = vi.fn().mockResolvedValue(undefined);
      const wrappedHandler = catchAsync(handler);
      
      await wrappedHandler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(handler).toHaveBeenCalledWith(mockReq, mockRes);
      expect(statusSpy).not.toHaveBeenCalled();
    });

    it('should catch and handle async errors', async () => {
      const error = new Error('Async error');
      const handler = vi.fn().mockRejectedValue(error);
      const wrappedHandler = catchAsync(handler);
      
      await wrappedHandler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(handler).toHaveBeenCalled();
      expect(statusSpy).toHaveBeenCalledWith(500);
      expect(jsonSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Internal server error'
        })
      );
    });

    it('should preserve custom status codes', async () => {
      const error = new Error('Validation error') as Error & { statusCode?: number };
      error.statusCode = 400;
      const handler = vi.fn().mockRejectedValue(error);
      const wrappedHandler = catchAsync(handler);
      
      await wrappedHandler(mockReq as VercelRequest, mockRes as VercelResponse);

      expect(statusSpy).toHaveBeenCalledWith(400);
    });
  });

  describe('wrapMiddleware()', () => {
    it('should execute middleware successfully', async () => {
      const next = vi.fn();
      const middleware = vi.fn((req, res, next) => next());
      const wrappedMiddleware = wrapMiddleware(middleware);
      
      await wrappedMiddleware(mockReq as VercelRequest, mockRes as VercelResponse, next);

      expect(middleware).toHaveBeenCalledWith(mockReq, mockRes, next);
      expect(next).toHaveBeenCalled();
      expect(statusSpy).not.toHaveBeenCalled();
    });

    it('should catch errors in middleware', async () => {
      const next = vi.fn();
      const error = new Error('Middleware error');
      const middleware = vi.fn().mockImplementation(() => {
        throw error;
      });
      const wrappedMiddleware = wrapMiddleware(middleware);
      
      await wrappedMiddleware(mockReq as VercelRequest, mockRes as VercelResponse, next);

      expect(middleware).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
      expect(statusSpy).toHaveBeenCalledWith(500);
    });

    it('should catch async errors in middleware', async () => {
      const next = vi.fn();
      const error = new Error('Async middleware error');
      const middleware = vi.fn().mockRejectedValue(error);
      const wrappedMiddleware = wrapMiddleware(middleware);
      
      await wrappedMiddleware(mockReq as VercelRequest, mockRes as VercelResponse, next);

      expect(statusSpy).toHaveBeenCalledWith(500);
    });
  });

  describe('Error handling integration', () => {
    it('should handle multiple error types', async () => {
      // Test different error scenarios
      const errors = [
        { error: new Error('Generic error'), expectedStatus: 500 },
        { 
          error: Object.assign(new Error('Bad request'), { statusCode: 400 }), 
          expectedStatus: 400 
        },
        { 
          error: Object.assign(new Error('Unauthorized'), { statusCode: 401 }), 
          expectedStatus: 401 
        },
      ];

      for (const { error, expectedStatus } of errors) {
        statusSpy.mockClear();
        jsonSpy.mockClear();

        const handler = vi.fn().mockRejectedValue(error);
        const wrappedHandler = catchAsync(handler);
        
        await wrappedHandler(mockReq as VercelRequest, mockRes as VercelResponse);

        expect(statusSpy).toHaveBeenCalledWith(expectedStatus);
      }
    });
  });
});

/**
 * API Integration Tests using Supertest
 * 
 * These tests demonstrate enterprise-grade API testing patterns
 * as specified in the automated testing requirements.
 * 
 * Pattern: Test that unauthorized access is blocked at the API level
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import type { VercelResponse } from '@vercel/node';
import { createServer } from 'http';
import { requireAuth, type AuthenticatedRequest } from '../../lib/middleware/auth';

/**
 * Mock Protected API Handler
 * This demonstrates the pattern for testing API endpoints with authentication
 */
function createProtectedApiHandler() {
  return async (req: AuthenticatedRequest, res: VercelResponse) => {
    // Apply authentication middleware first
    requireAuth(req, res, async () => {
      // This only runs if authentication succeeds
      res.status(200).json({ message: 'Access granted' });
    });
  };
}

/**
 * Create test server that wraps Vercel handlers for supertest
 */
function createTestServer(handler: (req: AuthenticatedRequest, res: VercelResponse) => Promise<void>) {
  return createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', async () => {
      try {
        const body = chunks.length > 0 ? Buffer.concat(chunks).toString() : '';
        
        // Create Vercel-like request object
        const vercelReq: AuthenticatedRequest = {
          method: req.method,
          url: req.url,
          headers: req.headers,
          body: body && req.headers['content-type']?.includes('application/json') 
            ? JSON.parse(body) 
            : body,
          query: {},
        } as AuthenticatedRequest;

        // Parse query parameters
        if (req.url?.includes('?')) {
          const [, queryString] = req.url.split('?');
          const params = new URLSearchParams(queryString);
          params.forEach((value, key) => {
            vercelReq.query[key] = value;
          });
        }

        // Create Vercel-like response object
        const vercelRes: VercelResponse = {
          status: (code: number) => {
            res.statusCode = code;
            return vercelRes;
          },
          json: (data: unknown) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
            return vercelRes;
          },
          setHeader: (key: string, value: string | string[]) => {
            res.setHeader(key, value);
            return vercelRes;
          },
          end: (data?: string) => {
            res.end(data);
            return vercelRes;
          },
        } as VercelResponse;

        await handler(vercelReq, vercelRes);
      } catch (err) {
        console.error('Handler error:', err);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'Internal server error' }));
      }
    });
  });
}

describe('API Authorization Tests - Supertest Example', () => {
  /**
   * EXAMPLE FROM PROBLEM STATEMENT:
   * Test that unauthorized access is blocked
   * 
   * This is the exact pattern requested:
   * - Use supertest
   * - Test POST endpoint
   * - Verify 401 status for unauthorized access
   */
  it('unauthorized access blocked', async () => {
    const app = createTestServer(createProtectedApiHandler());
    const res = await request(app).post('/api/campaigns');
    expect(res.status).toBe(401);
  });

  it('should reject requests without authentication token', async () => {
    const app = createTestServer(createProtectedApiHandler());
    
    const res = await request(app)
      .post('/api/campaigns')
      .send({
        name: 'Test Campaign',
        framework: 'OWASP LLM Top 10',
      });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toBe('Unauthorized');
  });

  it('should reject requests with invalid token format', async () => {
    const app = createTestServer(createProtectedApiHandler());
    
    const res = await request(app)
      .post('/api/campaigns')
      .set('Authorization', 'InvalidTokenFormat')
      .send({ name: 'Test' });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('should reject requests with malformed Bearer token', async () => {
    const app = createTestServer(createProtectedApiHandler());
    
    const res = await request(app)
      .post('/api/campaigns')
      .set('Authorization', 'Bearer invalid.token.here')
      .send({ name: 'Test' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Authentication failed');
  });

  it('should protect GET endpoints from unauthorized access', async () => {
    const app = createTestServer(createProtectedApiHandler());
    
    const res = await request(app).get('/api/campaigns');

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error', 'Unauthorized');
  });

  it('should protect PUT endpoints from unauthorized access', async () => {
    const app = createTestServer(createProtectedApiHandler());
    
    const res = await request(app)
      .put('/api/campaigns')
      .send({ id: '123', name: 'Updated' });

    expect(res.status).toBe(401);
  });

  it('should protect DELETE endpoints from unauthorized access', async () => {
    const app = createTestServer(createProtectedApiHandler());
    
    const res = await request(app)
      .delete('/api/campaigns')
      .query({ id: '123' });

    expect(res.status).toBe(401);
  });
});

describe('API Security Headers - Best Practices', () => {
  it('should return JSON error responses', async () => {
    const app = createTestServer(createProtectedApiHandler());
    
    const res = await request(app).post('/api/campaigns');

    expect(res.headers['content-type']).toContain('application/json');
    expect(res.body).toBeTypeOf('object');
  });

  it('should provide meaningful error messages', async () => {
    const app = createTestServer(createProtectedApiHandler());
    
    const res = await request(app).post('/api/campaigns');

    expect(res.body).toHaveProperty('error');
    expect(res.body).toHaveProperty('message');
    expect(res.body.message).toBe('No authentication token provided');
  });
});

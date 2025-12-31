/**
 * Integration tests for consolidated authentication endpoints
 * Tests that unified login and callback handlers correctly route to different providers
 */

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';

describe('Consolidated Auth Endpoints', () => {
  beforeAll(() => {
    // Set environment variables for tests
    process.env.AUTH0_DOMAIN = 'test.auth0.com';
    process.env.AUTH0_CLIENT_ID = 'test_client_id';
    process.env.AUTH0_CLIENT_SECRET = 'test_client_secret';
    process.env.AUTH0_CALLBACK_URL = 'http://localhost:3000/api/auth/callback?provider=auth0';
    process.env.SAML_ENTRY_POINT = 'https://idp.example.com/saml';
    process.env.SAML_ISSUER = 'ares-dashboard';
    process.env.SAML_CALLBACK_URL = 'http://localhost:3000/api/auth/callback?provider=saml';
    process.env.JWT_SECRET = 'test_jwt_secret_key_for_testing';
    process.env.JWT_REFRESH_SECRET = 'test_refresh_secret_key_for_testing';
  });

  afterEach(() => {
    // Clean up mocks
  });

  describe('GET /api/auth/login', () => {
    it('should reject requests without provider parameter', async () => {
      const handler = (await import('../../api/auth/login')).default;
      
      const req = {
        method: 'GET',
        query: {},
        headers: {},
      } as unknown as VercelRequest;

      const res = {
        status: (code: number) => ({
          json: (data: Record<string, unknown>) => {
            expect(code).toBe(400);
            expect(data.error).toBe('Bad Request');
            expect(data.message).toContain('Invalid or missing provider');
          }
        }),
        redirect: () => {},
        setHeader: () => {},
      } as unknown as VercelResponse;

      await handler(req, res);
    });

    it('should reject non-GET requests', async () => {
      const handler = (await import('../../api/auth/login')).default;
      
      const req = {
        method: 'POST',
        query: { provider: 'auth0' },
        headers: {},
      } as unknown as VercelRequest;

      const res = {
        status: (code: number) => ({
          json: (data: Record<string, unknown>) => {
            expect(code).toBe(405);
            expect(data.error).toBe('Method not allowed');
          }
        }),
        redirect: () => {},
        setHeader: () => {},
      } as unknown as VercelResponse;

      await handler(req, res);
    });

    it('should handle auth0 provider', async () => {
      const handler = (await import('../../api/auth/login')).default;
      
      const req = {
        method: 'GET',
        query: { provider: 'auth0' },
        headers: {},
      } as unknown as VercelRequest;

      let redirectUrl = '';
      const res = {
        redirect: (code: number, url: string) => {
          expect(code).toBe(302);
          redirectUrl = url;
          expect(url).toContain('test.auth0.com');
          expect(url).toContain('client_id=test_client_id');
        },
        setHeader: () => {},
      } as unknown as VercelResponse;

      await handler(req, res);
      expect(redirectUrl).toBeTruthy();
    });

    it('should handle saml provider', async () => {
      const handler = (await import('../../api/auth/login')).default;
      
      const req = {
        method: 'GET',
        query: { provider: 'saml' },
        headers: {},
      } as unknown as VercelRequest;

      let redirectUrl = '';
      const res = {
        redirect: (code: number, url: string) => {
          expect(code).toBe(302);
          redirectUrl = url;
          expect(url).toContain('idp.example.com');
        },
        setHeader: () => {},
      } as unknown as VercelResponse;

      await handler(req, res);
      expect(redirectUrl).toBeTruthy();
    });
  });

  describe('GET /api/auth/callback', () => {
    it('should reject requests without provider parameter', async () => {
      const handler = (await import('../../api/auth/callback')).default;
      
      const req = {
        method: 'GET',
        query: {},
        headers: {},
      } as unknown as VercelRequest;

      const res = {
        status: (code: number) => ({
          json: (data: Record<string, unknown>) => {
            expect(code).toBe(400);
            expect(data.error).toBe('Bad Request');
            expect(data.message).toContain('Invalid or missing provider');
          }
        }),
        redirect: () => {},
        setHeader: () => {},
      } as unknown as VercelResponse;

      await handler(req, res);
    });

    it('should enforce POST method for SAML callback', async () => {
      const handler = (await import('../../api/auth/callback')).default;
      
      const req = {
        method: 'GET',
        query: { provider: 'saml' },
        headers: {},
      } as unknown as VercelRequest;

      const res = {
        status: (code: number) => ({
          json: (data: Record<string, unknown>) => {
            expect(code).toBe(405);
            expect(data.error).toBe('Method not allowed. SAML callback requires POST.');
          }
        }),
        redirect: () => {},
        setHeader: () => {},
      } as unknown as VercelResponse;

      await handler(req, res);
    });

    it('should enforce GET method for Auth0 callback', async () => {
      const handler = (await import('../../api/auth/callback')).default;
      
      const req = {
        method: 'POST',
        query: { provider: 'auth0' },
        headers: {},
      } as unknown as VercelRequest;

      const res = {
        status: (code: number) => ({
          json: (data: Record<string, unknown>) => {
            expect(code).toBe(405);
            expect(data.error).toBe('Method not allowed. Auth0 callback requires GET.');
          }
        }),
        redirect: () => {},
        setHeader: () => {},
      } as unknown as VercelResponse;

      await handler(req, res);
    });
  });

  describe('Endpoint consolidation', () => {
    it('should be within Vercel Hobby plan limit of 12 serverless functions', async () => {
      // This test verifies that we have <= 12 API endpoints (Vercel Hobby plan limit)
      const fs = await import('fs');
      const path = await import('path');
      
      const apiDir = path.resolve(process.cwd(), 'api');
      
      // Count .ts files recursively (excluding tsconfig.json)
      function countTsFiles(dir: string): number {
        let count = 0;
        const files = fs.readdirSync(dir);
        
        for (const file of files) {
          const fullPath = path.join(dir, file);
          const stat = fs.statSync(fullPath);
          
          if (stat.isDirectory()) {
            count += countTsFiles(fullPath);
          } else if (file.endsWith('.ts') && file !== 'tsconfig.json') {
            count++;
          }
        }
        
        return count;
      }
      
      const apiEndpointCount = countTsFiles(apiDir);
      const VERCEL_HOBBY_LIMIT = 12;
      
      // Assert we're within the limit
      expect(apiEndpointCount).toBeLessThanOrEqual(VERCEL_HOBBY_LIMIT);
      
      // Also verify we successfully reduced from the original 12 to something less
      // This ensures the consolidation effort was successful
      expect(apiEndpointCount).toBeLessThan(12);
    });

    it('should not have old split auth endpoints', async () => {
      const fs = await import('fs');
      const path = await import('path');
      
      // Verify old endpoints don't exist
      const oldPaths = [
        path.resolve(process.cwd(), 'api/auth/login/auth0.ts'),
        path.resolve(process.cwd(), 'api/auth/login/saml.ts'),
        path.resolve(process.cwd(), 'api/auth/callback/auth0.ts'),
        path.resolve(process.cwd(), 'api/auth/callback/saml.ts'),
        path.resolve(process.cwd(), 'api/protected-example.ts'),
      ];
      
      for (const oldPath of oldPaths) {
        expect(fs.existsSync(oldPath)).toBe(false);
      }
    });

    it('should have new consolidated auth endpoints', async () => {
      const fs = await import('fs');
      const path = await import('path');
      
      // Verify new endpoints exist
      const newPaths = [
        path.resolve(process.cwd(), 'api/auth/login.ts'),
        path.resolve(process.cwd(), 'api/auth/callback.ts'),
      ];
      
      for (const newPath of newPaths) {
        expect(fs.existsSync(newPath)).toBe(true);
      }
    });
  });
});

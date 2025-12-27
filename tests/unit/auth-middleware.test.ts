import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth, requireRole, requirePermission, AuthenticatedRequest } from '../../api/middleware/auth';
import { generateTokens } from '../../services/auth/jwt';

describe('Auth Middleware', () => {
  let mockReq: Partial<AuthenticatedRequest>;
  let mockRes: Partial<VercelResponse>;
  let nextFn: () => void;

  beforeEach(() => {
    mockReq = {
      headers: {},
      method: 'GET'
    };
    
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };
    
    nextFn = vi.fn();
  });

  describe('requireAuth', () => {
    it('should reject request without authorization header', () => {
      requireAuth(mockReq as AuthenticatedRequest, mockRes as VercelResponse, nextFn);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unauthorized',
          message: 'No authentication token provided'
        })
      );
      expect(nextFn).not.toHaveBeenCalled();
    });

    it('should reject request with invalid token format', () => {
      mockReq.headers = {
        authorization: 'InvalidFormat'
      };

      requireAuth(mockReq as AuthenticatedRequest, mockRes as VercelResponse, nextFn);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unauthorized'
        })
      );
      expect(nextFn).not.toHaveBeenCalled();
    });

    it('should reject request with expired token', () => {
      // Create an expired token
      const expiredToken = Buffer.from(JSON.stringify({
        userId: 'user123',
        email: 'test@example.com',
        role: 'analyst',
        exp: Math.floor(Date.now() / 1000) - 3600 // Expired 1 hour ago
      })).toString('base64');

      mockReq.headers = {
        authorization: `Bearer ${expiredToken}`
      };

      requireAuth(mockReq as AuthenticatedRequest, mockRes as VercelResponse, nextFn);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unauthorized',
          message: 'Invalid or expired token'
        })
      );
      expect(nextFn).not.toHaveBeenCalled();
    });

    it('should accept request with valid token', () => {
      const tokens = generateTokens({
        userId: 'user123',
        email: 'test@example.com',
        role: 'analyst',
        organizationId: 'org123'
      });

      mockReq.headers = {
        authorization: `Bearer ${tokens.accessToken}`
      };

      requireAuth(mockReq as AuthenticatedRequest, mockRes as VercelResponse, nextFn);

      expect(nextFn).toHaveBeenCalled();
      expect(mockReq.user).toBeDefined();
      expect(mockReq.user?.userId).toBe('user123');
      expect(mockReq.user?.email).toBe('test@example.com');
      expect(mockReq.user?.role).toBe('analyst');
    });

    it('should attach user object to request', () => {
      const tokens = generateTokens({
        userId: 'user456',
        email: 'admin@example.com',
        role: 'admin',
        organizationId: 'org456',
        permissions: ['campaign:read', 'campaign:write']
      });

      mockReq.headers = {
        authorization: `Bearer ${tokens.accessToken}`
      };

      requireAuth(mockReq as AuthenticatedRequest, mockRes as VercelResponse, nextFn);

      expect(mockReq.user).toEqual(
        expect.objectContaining({
          userId: 'user456',
          email: 'admin@example.com',
          role: 'admin',
          organizationId: 'org456',
          permissions: expect.arrayContaining(['campaign:read', 'campaign:write'])
        })
      );
    });
  });

  describe('requireRole', () => {
    beforeEach(() => {
      // Setup authenticated user
      mockReq.user = {
        userId: 'user123',
        email: 'test@example.com',
        role: 'analyst',
        organizationId: 'org123'
      };
    });

    it('should reject unauthenticated request', () => {
      mockReq.user = undefined;
      const middleware = requireRole(['admin']);

      middleware(mockReq as AuthenticatedRequest, mockRes as VercelResponse, nextFn);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unauthorized'
        })
      );
      expect(nextFn).not.toHaveBeenCalled();
    });

    it('should reject user without required role', () => {
      const middleware = requireRole(['admin', 'red_team_lead']);

      middleware(mockReq as AuthenticatedRequest, mockRes as VercelResponse, nextFn);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Forbidden',
          message: expect.stringContaining('admin, red_team_lead')
        })
      );
      expect(nextFn).not.toHaveBeenCalled();
    });

    it('should accept user with required role', () => {
      const middleware = requireRole(['analyst', 'admin']);

      middleware(mockReq as AuthenticatedRequest, mockRes as VercelResponse, nextFn);

      expect(nextFn).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should accept admin for admin-only endpoint', () => {
      mockReq.user!.role = 'admin';
      const middleware = requireRole(['admin']);

      middleware(mockReq as AuthenticatedRequest, mockRes as VercelResponse, nextFn);

      expect(nextFn).toHaveBeenCalled();
    });
  });

  describe('requirePermission', () => {
    beforeEach(() => {
      mockReq.user = {
        userId: 'user123',
        email: 'test@example.com',
        role: 'analyst',
        organizationId: 'org123',
        permissions: ['campaign:read', 'tactic:read']
      };
    });

    it('should reject unauthenticated request', () => {
      mockReq.user = undefined;
      const middleware = requirePermission('campaign:write');

      middleware(mockReq as AuthenticatedRequest, mockRes as VercelResponse, nextFn);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(nextFn).not.toHaveBeenCalled();
    });

    it('should reject user without required permission', () => {
      const middleware = requirePermission('campaign:write');

      middleware(mockReq as AuthenticatedRequest, mockRes as VercelResponse, nextFn);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Forbidden',
          message: expect.stringContaining('campaign:write')
        })
      );
      expect(nextFn).not.toHaveBeenCalled();
    });

    it('should accept user with required permission', () => {
      const middleware = requirePermission('campaign:read');

      middleware(mockReq as AuthenticatedRequest, mockRes as VercelResponse, nextFn);

      expect(nextFn).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should handle user without permissions array', () => {
      mockReq.user!.permissions = undefined;
      const middleware = requirePermission('campaign:read');

      middleware(mockReq as AuthenticatedRequest, mockRes as VercelResponse, nextFn);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(nextFn).not.toHaveBeenCalled();
    });
  });

  describe('Integration: Full authentication flow', () => {
    it('should successfully authenticate and authorize valid request', () => {
      // Generate valid token
      const tokens = generateTokens({
        userId: 'admin123',
        email: 'admin@example.com',
        role: 'admin',
        organizationId: 'org123',
        permissions: ['campaign:read', 'campaign:write', 'campaign:delete']
      });

      mockReq.headers = {
        authorization: `Bearer ${tokens.accessToken}`
      };

      // First apply requireAuth
      requireAuth(mockReq as AuthenticatedRequest, mockRes as VercelResponse, () => {
        // Then apply requireRole
        const roleMiddleware = requireRole(['admin', 'red_team_lead']);
        roleMiddleware(mockReq as AuthenticatedRequest, mockRes as VercelResponse, () => {
          // Then apply requirePermission
          const permMiddleware = requirePermission('campaign:write');
          permMiddleware(mockReq as AuthenticatedRequest, mockRes as VercelResponse, nextFn);
        });
      });

      expect(nextFn).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should fail at role check even with valid token', () => {
      const tokens = generateTokens({
        userId: 'viewer123',
        email: 'viewer@example.com',
        role: 'viewer', // Not allowed
        organizationId: 'org123'
      });

      mockReq.headers = {
        authorization: `Bearer ${tokens.accessToken}`
      };

      requireAuth(mockReq as AuthenticatedRequest, mockRes as VercelResponse, () => {
        const roleMiddleware = requireRole(['admin']);
        roleMiddleware(mockReq as AuthenticatedRequest, mockRes as VercelResponse, nextFn);
      });

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(nextFn).not.toHaveBeenCalled();
    });
  });
});

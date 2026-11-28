import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { VercelResponse } from '@vercel/node';
import { 
  requireAuth, 
  requireRole, 
  requirePermission,
  requireAllPermissions,
  requireAnyPermission,
  requireOrganization,
  AuthenticatedRequest 
} from '../../lib/middleware/auth';
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
    it('should reject request without authorization header', async () => {
      await requireAuth(mockReq as AuthenticatedRequest, mockRes as VercelResponse, nextFn);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unauthorized',
          message: 'No authentication token provided'
        })
      );
      expect(nextFn).not.toHaveBeenCalled();
    });

    it('should reject request with invalid token format', async () => {
      mockReq.headers = {
        authorization: 'InvalidFormat'
      };

      await requireAuth(mockReq as AuthenticatedRequest, mockRes as VercelResponse, nextFn);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unauthorized'
        })
      );
      expect(nextFn).not.toHaveBeenCalled();
    });

    it('should reject request with expired token', async () => {
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

      await requireAuth(mockReq as AuthenticatedRequest, mockRes as VercelResponse, nextFn);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unauthorized',
          message: 'Authentication failed'
        })
      );
      expect(nextFn).not.toHaveBeenCalled();
    });

    it('should accept request with valid token', async () => {
      const tokens = generateTokens({
        userId: 'user123',
        email: 'test@example.com',
        role: 'analyst',
        organizationId: 'org123'
      });

      mockReq.headers = {
        authorization: `Bearer ${tokens.accessToken}`
      };

      await requireAuth(mockReq as AuthenticatedRequest, mockRes as VercelResponse, nextFn);

      expect(nextFn).toHaveBeenCalled();
      expect(mockReq.user).toBeDefined();
      expect(mockReq.user?.userId).toBe('user123');
      expect(mockReq.user?.email).toBe('test@example.com');
      expect(mockReq.user?.role).toBe('analyst');
    });

    it('should attach user object to request', async () => {
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

      await requireAuth(mockReq as AuthenticatedRequest, mockRes as VercelResponse, nextFn);

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

    it('should accept request with valid token in cookie', async () => {
      const tokens = generateTokens({
        userId: 'user789',
        email: 'cookie@example.com',
        role: 'analyst',
        organizationId: 'org789'
      });

      mockReq.headers = {
        cookie: `access_token=${tokens.accessToken}; other_cookie=value`
      };

      await requireAuth(mockReq as AuthenticatedRequest, mockRes as VercelResponse, nextFn);

      expect(nextFn).toHaveBeenCalled();
      expect(mockReq.user).toBeDefined();
      expect(mockReq.user?.userId).toBe('user789');
      expect(mockReq.user?.email).toBe('cookie@example.com');
    });

    it('should reject request with invalid token in cookie', async () => {
      mockReq.headers = {
        cookie: 'access_token=invalid_token; other_cookie=value'
      };

      await requireAuth(mockReq as AuthenticatedRequest, mockRes as VercelResponse, nextFn);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unauthorized',
          message: 'Authentication failed'
        })
      );
      expect(nextFn).not.toHaveBeenCalled();
    });

    it('should prefer Authorization header over cookie', async () => {
      const headerTokens = generateTokens({
        userId: 'header-user',
        email: 'header@example.com',
        role: 'admin',
        organizationId: 'org-header'
      });

      const cookieTokens = generateTokens({
        userId: 'cookie-user',
        email: 'cookie@example.com',
        role: 'analyst',
        organizationId: 'org-cookie'
      });

      mockReq.headers = {
        authorization: `Bearer ${headerTokens.accessToken}`,
        cookie: `access_token=${cookieTokens.accessToken}`
      };

      await requireAuth(mockReq as AuthenticatedRequest, mockRes as VercelResponse, nextFn);

      expect(nextFn).toHaveBeenCalled();
      expect(mockReq.user?.userId).toBe('header-user');
      expect(mockReq.user?.email).toBe('header@example.com');
    });

    it('should reject when cookie exists but no token present', async () => {
      mockReq.headers = {
        cookie: 'other_cookie=value; session_id=123'
      };

      await requireAuth(mockReq as AuthenticatedRequest, mockRes as VercelResponse, nextFn);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unauthorized',
          message: 'No authentication token provided'
        })
      );
      expect(nextFn).not.toHaveBeenCalled();
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

    it('should reject unauthenticated request', async () => {
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

    it('should reject user without required role', async () => {
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

    it('should accept user with required role', async () => {
      const middleware = requireRole(['analyst', 'admin']);

      middleware(mockReq as AuthenticatedRequest, mockRes as VercelResponse, nextFn);

      expect(nextFn).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should accept admin for admin-only endpoint', async () => {
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

    it('should reject unauthenticated request', async () => {
      mockReq.user = undefined;
      const middleware = requirePermission('campaign:write');

      middleware(mockReq as AuthenticatedRequest, mockRes as VercelResponse, nextFn);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(nextFn).not.toHaveBeenCalled();
    });

    it('should reject user without required permission', async () => {
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

    it('should accept user with required permission', async () => {
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
    it('should successfully authenticate and authorize valid request', async () => {
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
      await requireAuth(mockReq as AuthenticatedRequest, mockRes as VercelResponse, () => {
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

    it('should fail at role check even with valid token', async () => {
      const tokens = generateTokens({
        userId: 'viewer123',
        email: 'viewer@example.com',
        role: 'viewer', // Not allowed
        organizationId: 'org123'
      });

      mockReq.headers = {
        authorization: `Bearer ${tokens.accessToken}`
      };

      await requireAuth(mockReq as AuthenticatedRequest, mockRes as VercelResponse, () => {
        const roleMiddleware = requireRole(['admin']);
        roleMiddleware(mockReq as AuthenticatedRequest, mockRes as VercelResponse, nextFn);
      });

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(nextFn).not.toHaveBeenCalled();
    });
  });

  describe('requireAllPermissions', () => {
    beforeEach(() => {
      mockReq.user = {
        userId: 'user123',
        email: 'test@example.com',
        role: 'analyst',
        organizationId: 'org123',
        permissions: ['campaign:read', 'campaign:write', 'tactic:read']
      };
    });

    it('should reject unauthenticated request', async () => {
      mockReq.user = undefined;
      const middleware = requireAllPermissions(['campaign:read', 'campaign:write']);

      middleware(mockReq as AuthenticatedRequest, mockRes as VercelResponse, nextFn);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(nextFn).not.toHaveBeenCalled();
    });

    it('should reject user missing one of the required permissions', async () => {
      const middleware = requireAllPermissions(['campaign:read', 'campaign:delete']);

      middleware(mockReq as AuthenticatedRequest, mockRes as VercelResponse, nextFn);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(nextFn).not.toHaveBeenCalled();
    });

    it('should accept user with all required permissions', async () => {
      const middleware = requireAllPermissions(['campaign:read', 'campaign:write']);

      middleware(mockReq as AuthenticatedRequest, mockRes as VercelResponse, nextFn);

      expect(nextFn).toHaveBeenCalled();
    });
  });

  describe('requireAnyPermission', () => {
    beforeEach(() => {
      mockReq.user = {
        userId: 'user123',
        email: 'test@example.com',
        role: 'analyst',
        organizationId: 'org123',
        permissions: ['campaign:read', 'tactic:read']
      };
    });

    it('should reject unauthenticated request', async () => {
      mockReq.user = undefined;
      const middleware = requireAnyPermission(['campaign:write', 'campaign:delete']);

      middleware(mockReq as AuthenticatedRequest, mockRes as VercelResponse, nextFn);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(nextFn).not.toHaveBeenCalled();
    });

    it('should reject user without any of the required permissions', async () => {
      const middleware = requireAnyPermission(['campaign:write', 'campaign:delete']);

      middleware(mockReq as AuthenticatedRequest, mockRes as VercelResponse, nextFn);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(nextFn).not.toHaveBeenCalled();
    });

    it('should accept user with at least one required permission', async () => {
      const middleware = requireAnyPermission(['campaign:read', 'campaign:write']);

      middleware(mockReq as AuthenticatedRequest, mockRes as VercelResponse, nextFn);

      expect(nextFn).toHaveBeenCalled();
    });
  });

  describe('requireOrganization', () => {
    beforeEach(() => {
      mockReq.user = {
        userId: 'user123',
        email: 'test@example.com',
        role: 'analyst',
        organizationId: 'org123'
      };
    });

    it('should reject unauthenticated request', async () => {
      mockReq.user = undefined;
      const middleware = requireOrganization();

      middleware(mockReq as AuthenticatedRequest, mockRes as VercelResponse, nextFn);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(nextFn).not.toHaveBeenCalled();
    });

    it('should reject user without organization when none specified', async () => {
      mockReq.user!.organizationId = undefined;
      const middleware = requireOrganization();

      middleware(mockReq as AuthenticatedRequest, mockRes as VercelResponse, nextFn);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(nextFn).not.toHaveBeenCalled();
    });

    it('should accept user with organization when none specified', async () => {
      const middleware = requireOrganization();

      middleware(mockReq as AuthenticatedRequest, mockRes as VercelResponse, nextFn);

      expect(nextFn).toHaveBeenCalled();
    });

    it('should reject user from different organization', async () => {
      const middleware = requireOrganization('org456');

      middleware(mockReq as AuthenticatedRequest, mockRes as VercelResponse, nextFn);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(nextFn).not.toHaveBeenCalled();
    });

    it('should accept user from correct organization', async () => {
      const middleware = requireOrganization('org123');

      middleware(mockReq as AuthenticatedRequest, mockRes as VercelResponse, nextFn);

      expect(nextFn).toHaveBeenCalled();
    });
  });
});

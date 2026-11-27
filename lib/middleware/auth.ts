// Backend Authentication & Authorization Middleware
// Enforces server-side RBAC for enterprise security

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { decodeProtectedHeader } from 'jose';
import {
  verifyAccessToken,
  verifyAuth0AccessToken,
  extractTokenFromHeader,
  isProductionEnvironment,
  isLocalAuthAllowed,
  TokenPayload
} from '../../services/auth/jwt';
import { UserRepository } from '../../repositories/userRepository';

// Extend VercelRequest to include authenticated user
export interface AuthenticatedRequest extends VercelRequest {
  user?: TokenPayload;
  authMethod?: 'bearer' | 'cookie';
}

/**
 * Extract token from cookie
 */
function extractTokenFromCookie(cookieHeader?: string, cookieName = 'access_token'): string | null {
  if (!cookieHeader) {
    return null;
  }

  const hostMatch = cookieHeader.match(new RegExp(`(?:^|;\\s*)__Host-${cookieName}=([^;]+)`));
  if (hostMatch) {
    return hostMatch[1];
  }

  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${cookieName}=([^;]+)`));
  return match ? match[1] : null;
}

/**
 * Middleware to require authentication
 * Validates JWT token (RS256 Auth0 JWKS or non-prod HS256) and attaches DB-authoritative user to request.
 * Never falls back from an invalid Authorization header to cookies or anonymous access.
 */
export async function requireAuth(req: AuthenticatedRequest, res: VercelResponse, next: () => void | Promise<void>) {
  const authHeader = req.headers.authorization as string | undefined;
  let token: string | null = null;
  let authMethod: 'bearer' | 'cookie' | undefined;

  if (authHeader !== undefined) {
    token = extractTokenFromHeader(authHeader);
    if (!token) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid authorization header format'
      });
    }
    authMethod = 'bearer';
  } else {
    token = extractTokenFromCookie(req.headers.cookie as string | undefined);
    if (token) {
      authMethod = 'cookie';
    }
  }

  if (!token || !authMethod) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'No authentication token provided'
    });
  }

  let headerAlg: string | undefined;
  try {
    headerAlg = decodeProtectedHeader(token).alg;
  } catch {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication failed'
    });
  }

  if (headerAlg === 'RS256') {
    const auth0Identity = await verifyAuth0AccessToken(token);
    if (!auth0Identity) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication failed'
      });
    }

    try {
      const dbUser = await UserRepository.resolveAuth0User(auth0Identity);
      req.user = {
        userId: dbUser.id,
        email: dbUser.email,
        role: dbUser.role,
        organizationId: dbUser.orgId,
        authProvider: 'auth0'
      };
      req.authMethod = authMethod;
      return await next();
    } catch {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Account provisioning or linking required'
      });
    }
  }

  if (headerAlg === 'HS256') {
    const decoded = verifyAccessToken(token);
    if (!decoded) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication failed'
      });
    }

    if (isProductionEnvironment() && (decoded.authProvider === 'local' || !isLocalAuthAllowed() && decoded.authProvider !== 'auth0')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Local authentication tokens are not permitted in production'
      });
    }

    // Resolve authoritative DB role when DATABASE_URL is configured
    if (process.env.DATABASE_URL) {
      try {
        const dbUser = await UserRepository.findById(decoded.userId);
        if (!dbUser) {
          return res.status(401).json({
            error: 'Unauthorized',
            message: 'User account not found or deactivated'
          });
        }
        decoded.role = dbUser.role;
        decoded.organizationId = dbUser.orgId;
      } catch {
        // Fail closed only if DB lookup fails in production; in unit tests without live DB, keep decoded
        if (isProductionEnvironment()) {
          return res.status(401).json({ error: 'Unauthorized', message: 'Authentication failed' });
        }
      }
    }

    req.user = {
      ...decoded,
      authProvider: decoded.authProvider === 'auth0' ? 'auth0' : 'local'
    };
    req.authMethod = authMethod;
    return await next();
  }

  return res.status(401).json({
    error: 'Unauthorized',
    message: 'Unsupported token algorithm'
  });
}

/**
 * Middleware to require specific roles
 * Must be used after requireAuth middleware
 * 
 * @example
 * // Allow only admins and red team leads
 * requireRole(['admin', 'red_team_lead'])
 */
export function requireRole(allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: VercelResponse, next: () => void) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Forbidden',
        message: `Access denied. Required roles: ${allowedRoles.join(', ')}`,
        userRole: req.user.role
      });
    }

    next();
  };
}

/**
 * Middleware to require specific permissions
 * Must be used after requireAuth middleware
 * Checks if user has the required permission in their permissions array
 * 
 * @example
 * // Require campaign:write permission
 * requirePermission('campaign:write')
 */
export function requirePermission(permission: string) {
  return (req: AuthenticatedRequest, res: VercelResponse, next: () => void) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }

    const userPermissions = req.user.permissions || [];
    
    if (!userPermissions.includes(permission)) {
      return res.status(403).json({ 
        error: 'Forbidden',
        message: `Access denied. Required permission: ${permission}`,
        userPermissions
      });
    }

    next();
  };
}

/**
 * Middleware to check multiple permissions (requires ALL)
 */
export function requireAllPermissions(permissions: string[]) {
  return (req: AuthenticatedRequest, res: VercelResponse, next: () => void) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }

    const userPermissions = req.user.permissions || [];
    const missingPermissions = permissions.filter(p => !userPermissions.includes(p));
    
    if (missingPermissions.length > 0) {
      return res.status(403).json({ 
        error: 'Forbidden',
        message: `Access denied. Missing permissions: ${missingPermissions.join(', ')}`,
        userPermissions
      });
    }

    next();
  };
}

/**
 * Middleware to check multiple permissions (requires ANY)
 */
export function requireAnyPermission(permissions: string[]) {
  return (req: AuthenticatedRequest, res: VercelResponse, next: () => void) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }

    const userPermissions = req.user.permissions || [];
    const hasAnyPermission = permissions.some(p => userPermissions.includes(p));
    
    if (!hasAnyPermission) {
      return res.status(403).json({ 
        error: 'Forbidden',
        message: `Access denied. Required one of: ${permissions.join(', ')}`,
        userPermissions
      });
    }

    next();
  };
}

/**
 * Optional authentication - attaches user if token is present and valid
 * Does not reject request if token is missing or invalid
 * Supports both Authorization header and HttpOnly cookies
 */
export function optionalAuth(req: AuthenticatedRequest, res: VercelResponse, next: () => void) {
  // Try Authorization header first
  let token = extractTokenFromHeader(req.headers.authorization as string | undefined);
  
  // Fall back to cookie if no header
  if (!token) {
    token = extractTokenFromCookie(req.headers.cookie as string | undefined);
  }
  
  if (token) {
    const decoded = verifyAccessToken(token);
    if (decoded) {
      req.user = decoded;
    }
  }
  
  next();
}

/**
 * Middleware to ensure user belongs to specified organization
 * Useful for multi-tenant isolation
 */
export function requireOrganization(organizationId?: string) {
  return (req: AuthenticatedRequest, res: VercelResponse, next: () => void) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Authentication required'
      });
    }

    // If no specific organization specified, just ensure user has one
    if (!organizationId) {
      if (!req.user.organizationId) {
        return res.status(403).json({ 
          error: 'Forbidden',
          message: 'User must belong to an organization'
        });
      }
      return next();
    }

    // Check specific organization
    if (req.user.organizationId !== organizationId) {
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'Access denied. User does not belong to this organization'
      });
    }

    next();
  };
}

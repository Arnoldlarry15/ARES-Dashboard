// Backend Authentication & Authorization Middleware
// Enforces server-side RBAC for enterprise security

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAccessToken, extractTokenFromHeader, TokenPayload } from '../../services/auth/jwt';

// Extend VercelRequest to include authenticated user
export interface AuthenticatedRequest extends VercelRequest {
  user?: TokenPayload;
}

/**
 * Middleware to require authentication
 * Validates JWT token and attaches user to request
 */
export function requireAuth(req: AuthenticatedRequest, res: VercelResponse, next: () => void) {
  const authHeader = req.headers.authorization as string | undefined;
  const token = extractTokenFromHeader(authHeader);
  
  if (!token) {
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'No authentication token provided'
    });
  }

  const decoded = verifyAccessToken(token);
  
  if (!decoded) {
    return res.status(401).json({ 
      error: 'Unauthorized',
      message: 'Invalid or expired token'
    });
  }

  // Attach user to request
  req.user = decoded;
  next();
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
 */
export function optionalAuth(req: AuthenticatedRequest, res: VercelResponse, next: () => void) {
  const authHeader = req.headers.authorization as string | undefined;
  const token = extractTokenFromHeader(authHeader);
  
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

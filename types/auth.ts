// Authentication and Authorization Types

export enum UserRole {
  ADMIN = 'admin',
  RED_TEAM_LEAD = 'red_team_lead',
  ANALYST = 'analyst',
  VIEWER = 'viewer'
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  organization_id?: string;
  avatar_url?: string;
  created_at: string;
  last_login?: string;
}

export interface Session {
  token: string;
  refresh_token: string;
  user: User;
  expires_at: string;
  device_info?: {
    user_agent: string;
    ip_address: string;
    device_id: string;
  };
}

export interface Permission {
  resource: 'tactics' | 'campaigns' | 'payloads' | 'exports' | 'settings' | 'users';
  action: 'read' | 'write' | 'delete' | 'share';
}

// Role-based permissions matrix
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.ADMIN]: [
    { resource: 'tactics', action: 'read' },
    { resource: 'tactics', action: 'write' },
    { resource: 'campaigns', action: 'read' },
    { resource: 'campaigns', action: 'write' },
    { resource: 'campaigns', action: 'delete' },
    { resource: 'campaigns', action: 'share' },
    { resource: 'payloads', action: 'read' },
    { resource: 'payloads', action: 'write' },
    { resource: 'exports', action: 'read' },
    { resource: 'exports', action: 'write' },
    { resource: 'settings', action: 'read' },
    { resource: 'settings', action: 'write' },
    { resource: 'users', action: 'read' },
    { resource: 'users', action: 'write' },
    { resource: 'users', action: 'delete' }
  ],
  [UserRole.RED_TEAM_LEAD]: [
    { resource: 'tactics', action: 'read' },
    { resource: 'campaigns', action: 'read' },
    { resource: 'campaigns', action: 'write' },
    { resource: 'campaigns', action: 'delete' },
    { resource: 'campaigns', action: 'share' },
    { resource: 'payloads', action: 'read' },
    { resource: 'payloads', action: 'write' },
    { resource: 'exports', action: 'read' },
    { resource: 'exports', action: 'write' },
    { resource: 'settings', action: 'read' }
  ],
  [UserRole.ANALYST]: [
    { resource: 'tactics', action: 'read' },
    { resource: 'campaigns', action: 'read' },
    { resource: 'campaigns', action: 'write' },
    { resource: 'payloads', action: 'read' },
    { resource: 'payloads', action: 'write' },
    { resource: 'exports', action: 'read' },
    { resource: 'exports', action: 'write' }
  ],
  [UserRole.VIEWER]: [
    { resource: 'tactics', action: 'read' },
    { resource: 'campaigns', action: 'read' },
    { resource: 'payloads', action: 'read' },
    { resource: 'exports', action: 'read' }
  ]
};

// Check if user has specific permission
export function hasPermission(
  user: User,
  resource: Permission['resource'],
  action: Permission['action']
): boolean {
  const permissions = ROLE_PERMISSIONS[user.role];
  return permissions.some(p => p.resource === resource && p.action === action);
}

// Get role display information
export function getRoleInfo(role: UserRole): { label: string; color: string; description: string } {
  const roleInfo = {
    [UserRole.ADMIN]: {
      label: 'Administrator',
      color: 'red',
      description: 'Full system access with user management'
    },
    [UserRole.RED_TEAM_LEAD]: {
      label: 'Red Team Lead',
      color: 'purple',
      description: 'Manage campaigns and coordinate testing'
    },
    [UserRole.ANALYST]: {
      label: 'Security Analyst',
      color: 'blue',
      description: 'Create and execute attack scenarios'
    },
    [UserRole.VIEWER]: {
      label: 'Viewer',
      color: 'gray',
      description: 'Read-only access to campaigns and results'
    }
  };
  return roleInfo[role];
}

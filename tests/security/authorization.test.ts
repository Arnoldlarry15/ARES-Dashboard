import { describe, it, expect } from 'vitest';
import { hasPermission, UserRole, ROLE_PERMISSIONS } from '../../types/auth';
import type { User } from '../../types/auth';

describe('Authorization Security Tests', () => {
  const createUser = (role: UserRole): User => ({
    id: 'test-user',
    email: 'test@example.com',
    name: 'Test User',
    role,
    created_at: new Date().toISOString()
  });

  describe('Admin Role Permissions', () => {
    it('should allow admin to perform all actions', () => {
      const admin = createUser(UserRole.ADMIN);

      expect(hasPermission(admin, 'campaigns', 'read')).toBe(true);
      expect(hasPermission(admin, 'campaigns', 'write')).toBe(true);
      expect(hasPermission(admin, 'campaigns', 'delete')).toBe(true);
      expect(hasPermission(admin, 'campaigns', 'share')).toBe(true);
      expect(hasPermission(admin, 'users', 'write')).toBe(true);
      expect(hasPermission(admin, 'users', 'delete')).toBe(true);
    });

    it('should have access to all resources', () => {
      const adminPermissions = ROLE_PERMISSIONS[UserRole.ADMIN];
      const resources = new Set(adminPermissions.map(p => p.resource));
      
      expect(resources.has('tactics')).toBe(true);
      expect(resources.has('campaigns')).toBe(true);
      expect(resources.has('payloads')).toBe(true);
      expect(resources.has('exports')).toBe(true);
      expect(resources.has('settings')).toBe(true);
      expect(resources.has('users')).toBe(true);
    });
  });

  describe('Viewer Role Restrictions', () => {
    it('should prevent viewer from creating campaigns', () => {
      const viewer = createUser(UserRole.VIEWER);
      expect(hasPermission(viewer, 'campaigns', 'write')).toBe(false);
    });

    it('should prevent viewer from deleting campaigns', () => {
      const viewer = createUser(UserRole.VIEWER);
      expect(hasPermission(viewer, 'campaigns', 'delete')).toBe(false);
    });

    it('should prevent viewer from sharing campaigns', () => {
      const viewer = createUser(UserRole.VIEWER);
      expect(hasPermission(viewer, 'campaigns', 'share')).toBe(false);
    });

    it('should prevent viewer from managing users', () => {
      const viewer = createUser(UserRole.VIEWER);
      expect(hasPermission(viewer, 'users', 'write')).toBe(false);
      expect(hasPermission(viewer, 'users', 'delete')).toBe(false);
    });

    it('should allow viewer to read resources', () => {
      const viewer = createUser(UserRole.VIEWER);
      
      expect(hasPermission(viewer, 'tactics', 'read')).toBe(true);
      expect(hasPermission(viewer, 'campaigns', 'read')).toBe(true);
      expect(hasPermission(viewer, 'payloads', 'read')).toBe(true);
      expect(hasPermission(viewer, 'exports', 'read')).toBe(true);
    });

    it('should only have read permissions', () => {
      const viewerPermissions = ROLE_PERMISSIONS[UserRole.VIEWER];
      
      expect(viewerPermissions.every(p => p.action === 'read')).toBe(true);
    });
  });

  describe('Analyst Role Permissions', () => {
    it('should allow analyst to create campaigns', () => {
      const analyst = createUser(UserRole.ANALYST);
      expect(hasPermission(analyst, 'campaigns', 'write')).toBe(true);
    });

    it('should prevent analyst from deleting campaigns', () => {
      const analyst = createUser(UserRole.ANALYST);
      expect(hasPermission(analyst, 'campaigns', 'delete')).toBe(false);
    });

    it('should prevent analyst from managing users', () => {
      const analyst = createUser(UserRole.ANALYST);
      expect(hasPermission(analyst, 'users', 'write')).toBe(false);
      expect(hasPermission(analyst, 'users', 'delete')).toBe(false);
    });

    it('should allow analyst to work with payloads', () => {
      const analyst = createUser(UserRole.ANALYST);
      
      expect(hasPermission(analyst, 'payloads', 'read')).toBe(true);
      expect(hasPermission(analyst, 'payloads', 'write')).toBe(true);
    });
  });

  describe('Red Team Lead Role Permissions', () => {
    it('should allow red team lead to manage campaigns', () => {
      const lead = createUser(UserRole.RED_TEAM_LEAD);
      
      expect(hasPermission(lead, 'campaigns', 'read')).toBe(true);
      expect(hasPermission(lead, 'campaigns', 'write')).toBe(true);
      expect(hasPermission(lead, 'campaigns', 'delete')).toBe(true);
      expect(hasPermission(lead, 'campaigns', 'share')).toBe(true);
    });

    it('should prevent red team lead from deleting users', () => {
      const lead = createUser(UserRole.RED_TEAM_LEAD);
      expect(hasPermission(lead, 'users', 'delete')).toBe(false);
    });

    it('should allow red team lead to read settings', () => {
      const lead = createUser(UserRole.RED_TEAM_LEAD);
      expect(hasPermission(lead, 'settings', 'read')).toBe(true);
    });

    it('should prevent red team lead from writing settings', () => {
      const lead = createUser(UserRole.RED_TEAM_LEAD);
      expect(hasPermission(lead, 'settings', 'write')).toBe(false);
    });
  });

  describe('Permission Enforcement', () => {
    it('should enforce strict permission checking', () => {
      const roles = [UserRole.ADMIN, UserRole.RED_TEAM_LEAD, UserRole.ANALYST, UserRole.VIEWER];
      
      roles.forEach(role => {
        const user = createUser(role);
        const permissions = ROLE_PERMISSIONS[role];
        
        // Verify that only defined permissions return true
        permissions.forEach(permission => {
          expect(hasPermission(user, permission.resource, permission.action)).toBe(true);
        });
      });
    });

    it('should deny undefined permissions', () => {
      const viewer = createUser(UserRole.VIEWER);
      
      // Viewer should not have write access to anything
      expect(hasPermission(viewer, 'campaigns', 'write')).toBe(false);
      expect(hasPermission(viewer, 'payloads', 'write')).toBe(false);
      expect(hasPermission(viewer, 'settings', 'write')).toBe(false);
    });

    it('should maintain principle of least privilege', () => {
      const analyst = createUser(UserRole.ANALYST);
      const analystPermissions = ROLE_PERMISSIONS[UserRole.ANALYST];
      
      // Analyst should not have user management permissions
      expect(analystPermissions.some(p => p.resource === 'users')).toBe(false);
      
      // Analyst should not have delete campaign permission
      const canDeleteCampaign = analystPermissions.some(
        p => p.resource === 'campaigns' && p.action === 'delete'
      );
      expect(canDeleteCampaign).toBe(false);
    });
  });

  describe('Role Hierarchy', () => {
    it('should ensure admin has most permissions', () => {
      const adminPerms = ROLE_PERMISSIONS[UserRole.ADMIN].length;
      const leadPerms = ROLE_PERMISSIONS[UserRole.RED_TEAM_LEAD].length;
      const analystPerms = ROLE_PERMISSIONS[UserRole.ANALYST].length;
      const viewerPerms = ROLE_PERMISSIONS[UserRole.VIEWER].length;
      
      expect(adminPerms).toBeGreaterThan(leadPerms);
      expect(leadPerms).toBeGreaterThan(analystPerms);
      expect(analystPerms).toBeGreaterThan(viewerPerms);
    });

    it('should ensure viewer has fewest permissions', () => {
      const viewerPerms = ROLE_PERMISSIONS[UserRole.VIEWER].length;
      
      Object.values(UserRole).forEach(role => {
        if (role !== UserRole.VIEWER) {
          expect(ROLE_PERMISSIONS[role].length).toBeGreaterThanOrEqual(viewerPerms);
        }
      });
    });
  });
});

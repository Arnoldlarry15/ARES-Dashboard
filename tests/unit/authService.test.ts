import { describe, it, expect, beforeEach } from 'vitest';
import { AuthService } from '../../services/authService';
import { UserRole } from '../../types/auth';

describe('AuthService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('initLocalSession', () => {
    it('should create session with specified role', () => {
      const session = AuthService.initLocalSession(UserRole.ANALYST);
      
      expect(session.user.role).toBe(UserRole.ANALYST);
      expect(session.token).toBeDefined();
      expect(session.token).toContain('local_token_');
      expect(session.refresh_token).toBeDefined();
      expect(session.expires_at).toBeDefined();
    });

    it('should set session expiry to 24 hours', () => {
      const session = AuthService.initLocalSession(UserRole.ADMIN);
      const expiryTime = new Date(session.expires_at).getTime();
      const expectedExpiry = Date.now() + 24 * 60 * 60 * 1000;
      
      // Allow 1 second tolerance for test execution time
      expect(expiryTime).toBeGreaterThanOrEqual(expectedExpiry - 1000);
      expect(expiryTime).toBeLessThanOrEqual(expectedExpiry + 1000);
    });

    it('should create user with correct email format', () => {
      const session = AuthService.initLocalSession(UserRole.RED_TEAM_LEAD);
      
      expect(session.user.email).toContain('@local.ares.app');
      expect(session.user.email).toContain('red_team_lead');
    });

    it('should save session to localStorage', () => {
      AuthService.initLocalSession(UserRole.VIEWER);
      
      const stored = localStorage.getItem('ares_auth_session');
      expect(stored).not.toBeNull();
      
      const parsedSession = JSON.parse(stored!);
      expect(parsedSession.user.role).toBe(UserRole.VIEWER);
    });
  });

  describe('getSession', () => {
    it('should return null when no session exists', () => {
      const session = AuthService.getSession();
      expect(session).toBeNull();
    });

    it('should return session when valid session exists', () => {
      const createdSession = AuthService.initLocalSession(UserRole.ANALYST);
      
      const retrievedSession = AuthService.getSession();
      expect(retrievedSession).not.toBeNull();
      expect(retrievedSession?.user.role).toBe(UserRole.ANALYST);
      expect(retrievedSession?.token).toBe(createdSession.token);
    });

    it('should return null for expired session', () => {
      const session = AuthService.initLocalSession(UserRole.ANALYST);
      const expiredSession = {
        ...session,
        expires_at: new Date(Date.now() - 1000).toISOString()
      };
      localStorage.setItem('ares_auth_session', JSON.stringify(expiredSession));
      
      const retrieved = AuthService.getSession();
      expect(retrieved).toBeNull();
    });

    it('should clear expired session from storage', () => {
      const session = AuthService.initLocalSession(UserRole.ANALYST);
      const expiredSession = {
        ...session,
        expires_at: new Date(Date.now() - 1000).toISOString()
      };
      localStorage.setItem('ares_auth_session', JSON.stringify(expiredSession));
      
      AuthService.getSession();
      
      const stored = localStorage.getItem('ares_auth_session');
      expect(stored).toBeNull();
    });
  });

  describe('getCurrentUser', () => {
    it('should return null when no session exists', () => {
      const user = AuthService.getCurrentUser();
      expect(user).toBeNull();
    });

    it('should return user when valid session exists', () => {
      AuthService.initLocalSession(UserRole.RED_TEAM_LEAD);
      
      const user = AuthService.getCurrentUser();
      expect(user).not.toBeNull();
      expect(user?.role).toBe(UserRole.RED_TEAM_LEAD);
    });
  });

  describe('clearSession', () => {
    it('should remove session from localStorage', () => {
      AuthService.initLocalSession(UserRole.ADMIN);
      expect(localStorage.getItem('ares_auth_session')).not.toBeNull();
      
      AuthService.clearSession();
      
      expect(localStorage.getItem('ares_auth_session')).toBeNull();
      expect(localStorage.getItem('ares_demo_mode')).toBeNull();
    });

    it('should create logout audit log', () => {
      AuthService.initLocalSession(UserRole.ADMIN);
      AuthService.clearSession();
      
      const logs = AuthService.getAuditLogs();
      const logoutLog = logs.find(log => log.action === 'logout');
      
      expect(logoutLog).toBeDefined();
      expect(logoutLog?.resource_type).toBe('session');
    });
  });

  describe('refreshSession', () => {
    it('should return null when no session exists', async () => {
      const refreshed = await AuthService.refreshSession();
      expect(refreshed).toBeNull();
    });

    it('should create new token when refreshing valid session', async () => {
      const original = AuthService.initLocalSession(UserRole.ANALYST);
      
      const refreshed = await AuthService.refreshSession();
      
      expect(refreshed).not.toBeNull();
      expect(refreshed?.token).not.toBe(original.token);
      expect(refreshed?.user.id).toBe(original.user.id);
    });
  });

  describe('getAuditLogs', () => {
    it('should return empty array when no logs exist', () => {
      const logs = AuthService.getAuditLogs();
      expect(logs).toEqual([]);
    });

    it('should return audit logs after user actions', () => {
      AuthService.initLocalSession(UserRole.ADMIN);
      
      const logs = AuthService.getAuditLogs();
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].action).toBe('login');
    });

    it('should filter logs by user_id', () => {
      const session1 = AuthService.initLocalSession(UserRole.ADMIN);
      AuthService.clearSession();
      
      const session2 = AuthService.initLocalSession(UserRole.ANALYST);
      
      const filtered = AuthService.getAuditLogs({ user_id: session1.user.id });
      
      expect(filtered.every(log => log.user_id === session1.user.id)).toBe(true);
    });

    it('should filter logs by action', () => {
      AuthService.initLocalSession(UserRole.ADMIN);
      AuthService.clearSession();
      AuthService.initLocalSession(UserRole.ANALYST);
      
      const loginLogs = AuthService.getAuditLogs({ action: 'login' });
      
      expect(loginLogs.every(log => log.action === 'login')).toBe(true);
      expect(loginLogs.length).toBe(2);
    });
  });

  describe('exportAuditLogs', () => {
    it('should export logs as JSON by default', () => {
      AuthService.initLocalSession(UserRole.ADMIN);
      
      const exported = AuthService.exportAuditLogs();
      const parsed = JSON.parse(exported);
      
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBeGreaterThan(0);
    });

    it('should export logs as CSV when specified', () => {
      AuthService.initLocalSession(UserRole.ADMIN);
      
      const exported = AuthService.exportAuditLogs('csv');
      
      expect(exported).toContain('Timestamp');
      expect(exported).toContain('User Email');
      expect(exported).toContain('Action');
      expect(exported.split('\n').length).toBeGreaterThan(1);
    });
  });

  describe('isLocalAuth', () => {
    it('should return false when no session exists', () => {
      expect(AuthService.isLocalAuth()).toBe(false);
    });

    it('should return true after demo session is created', () => {
      AuthService.initLocalSession(UserRole.ADMIN);
      expect(AuthService.isLocalAuth()).toBe(true);
    });
  });
});

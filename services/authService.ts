// Authentication Service with Session Management and Audit Logging
// Now uses database-backed API with localStorage fallback

import { User, Session, UserRole } from '../types/auth';
import { AuditLogAPI } from '../utils/apiClient';

const AUTH_STORAGE_KEY = 'ares_auth_session';
const LOCAL_AUTH_KEY = 'ares_local_auth';

// Audit log entry type
export interface AuditLogEntry {
  id: string;
  user_id: string;
  user_email: string;
  action: string;
  resource_type: 'campaign' | 'tactic' | 'payload' | 'export' | 'user' | 'session';
  resource_id?: string;
  details?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
  timestamp: string;
  session_id?: string;
}

export class AuthService {
  // For local/development purposes, create a local user
  private static createLocalUser(role: UserRole = UserRole.ANALYST): User {
    return {
      id: 'local_user_' + Date.now(),
      email: `${role}@local.ares.app`,
      name: `${role.replace('_', ' ').toUpperCase()}`,
      role,
      created_at: new Date().toISOString(),
      last_login: new Date().toISOString()
    };
  }

  // Initialize local session for development/testing
  static initLocalSession(role: UserRole = UserRole.ANALYST): Session {
    const user = this.createLocalUser(role);
    const session: Session = {
      token: 'local_token_' + crypto.randomUUID(),
      refresh_token: 'local_refresh_' + crypto.randomUUID(),
      user,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      device_info: {
        user_agent: navigator.userAgent,
        ip_address: '127.0.0.1',
        device_id: 'local_device_' + Date.now()
      }
    };

    this.saveSession(session);
    this.logAuditEvent({
      user_id: user.id,
      user_email: user.email,
      action: 'login',
      resource_type: 'session',
      details: { local_auth: true, role }
    });

    return session;
  }

  // Save session to localStorage
  static saveSession(session: Session): void {
    try {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
      localStorage.setItem(LOCAL_AUTH_KEY, 'true');
    } catch (error) {
      console.error('Failed to save session:', error);
    }
  }

  // Get current session
  static getSession(): Session | null {
    try {
      const stored = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!stored) return null;

      const session: Session = JSON.parse(stored);
      
      // Check if session is expired
      if (new Date(session.expires_at) < new Date()) {
        this.clearSession();
        return null;
      }

      return session;
    } catch (error) {
      console.error('Failed to load session:', error);
      return null;
    }
  }

  // Get current user
  static getCurrentUser(): User | null {
    const session = this.getSession();
    return session?.user || null;
  }

  // Check if using local authentication (for development/testing)
  // Returns false in production when OAuth/enterprise auth is integrated
  static isLocalAuth(): boolean {
    return localStorage.getItem(LOCAL_AUTH_KEY) === 'true';
  }

  // Clear session (logout)
  static clearSession(): void {
    const user = this.getCurrentUser();
    if (user) {
      this.logAuditEvent({
        user_id: user.id,
        user_email: user.email,
        action: 'logout',
        resource_type: 'session'
      });
    }

    localStorage.removeItem(AUTH_STORAGE_KEY);
    localStorage.removeItem(LOCAL_AUTH_KEY);
  }

  // Refresh session token
  static async refreshSession(): Promise<Session | null> {
    const currentSession = this.getSession();
    if (!currentSession) return null;

    // In production, this would call an OAuth provider API
    const newSession: Session = {
      ...currentSession,
      token: 'local_token_' + crypto.randomUUID(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };

    this.saveSession(newSession);
    return newSession;
  }

  // Audit logging - now uses database
  static logAuditEvent(event: Omit<AuditLogEntry, 'id' | 'timestamp' | 'ip_address' | 'user_agent' | 'session_id'>): void {
    const session = this.getSession();
    const auditEntry: AuditLogEntry = {
      id: 'audit_' + Date.now() + '_' + crypto.randomUUID(),
      ...event,
      timestamp: new Date().toISOString(),
      ip_address: session?.device_info?.ip_address || 'unknown',
      user_agent: navigator.userAgent,
      session_id: session?.token
    };

    // Try to save to database, fallback to localStorage
    this.saveAuditLog(auditEntry);
  }

  private static async saveAuditLog(entry: AuditLogEntry): Promise<void> {
    try {
      // Try database first
      await AuditLogAPI.create({
        actorId: entry.user_id,
        action: entry.action,
        target: entry.resource_id || entry.resource_type,
        details: {
          resource_type: entry.resource_type,
          ...entry.details,
        },
        ipAddress: entry.ip_address,
        userAgent: entry.user_agent,
      });
    } catch (err) {
      // Fallback to localStorage if database is unavailable
      console.error('Failed to load audit logs from database:', err);
      try {
        const stored = localStorage.getItem('ares_audit_logs');
        const logs: AuditLogEntry[] = stored ? JSON.parse(stored) : [];
        logs.unshift(entry);
        
        // Keep only last 1000 entries in localStorage
        const trimmedLogs = logs.slice(0, 1000);
        localStorage.setItem('ares_audit_logs', JSON.stringify(trimmedLogs));
      } catch (localError) {
        console.error('Failed to save audit log:', localError);
      }
    }
  }

  // Get audit logs - now uses database
  static async getAuditLogs(filters?: {
    user_id?: string;
    action?: string;
    resource_type?: string;
    since?: Date;
  }): Promise<AuditLogEntry[]> {
    try {
      // Try database first
      const apiFilters: Record<string, string> = {};
      if (filters?.user_id) apiFilters.actorId = filters.user_id;
      if (filters?.action) apiFilters.action = filters.action;
      if (filters?.since) apiFilters.startDate = filters.since.toISOString();
      
      const { auditLogs } = await AuditLogAPI.getAll(apiFilters, { take: 1000 });
      
      // Convert to old format for compatibility
      const converted: AuditLogEntry[] = auditLogs.map(log => ({
        id: log.id,
        user_id: log.actorId,
        user_email: log.actor?.email || 'unknown',
        action: log.action,
        resource_type: (log.details as Record<string, unknown>)?.resource_type as string || 'session',
        resource_id: log.target,
        details: log.details as Record<string, unknown>,
        ip_address: log.ipAddress,
        user_agent: log.userAgent,
        timestamp: log.timestamp,
        session_id: undefined,
      }));
      
      // Apply resource_type filter
      if (filters?.resource_type) {
        return converted.filter(log => log.resource_type === filters.resource_type);
      }
      
      return converted;
    } catch (err) {
      // Fallback to localStorage
      console.error('Failed to load audit logs from database:', err);
      try {
        const stored = localStorage.getItem('ares_audit_logs');
        if (!stored) return [];

        let logs: AuditLogEntry[] = JSON.parse(stored);

        // Apply filters
        if (filters) {
          if (filters.user_id) {
            logs = logs.filter(log => log.user_id === filters.user_id);
          }
          if (filters.action) {
            logs = logs.filter(log => log.action === filters.action);
          }
          if (filters.resource_type) {
            logs = logs.filter(log => log.resource_type === filters.resource_type);
          }
          if (filters.since) {
            logs = logs.filter(log => new Date(log.timestamp) >= filters.since!);
          }
        }

        return logs;
      } catch (localError) {
        console.error('Failed to load audit logs:', localError);
        return [];
      }
    }
  }

  // Export audit logs for compliance
  static async exportAuditLogs(format: 'json' | 'csv' = 'json'): Promise<string> {
    const logs = await this.getAuditLogs();
    
    if (format === 'csv') {
      const headers = ['Timestamp', 'User Email', 'Action', 'Resource Type', 'Resource ID', 'IP Address'];
      const rows = logs.map(log => [
        log.timestamp,
        log.user_email,
        log.action,
        log.resource_type,
        log.resource_id || '',
        log.ip_address || ''
      ]);
      
      return [headers, ...rows].map(row => row.join(',')).join('\n');
    }

    return JSON.stringify(logs, null, 2);
  }
}

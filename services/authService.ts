// Authentication Service with Session Management and Audit Logging

import { User, Session, UserRole } from '../types/auth';

const AUTH_STORAGE_KEY = 'ares_auth_session';
const DEMO_MODE_KEY = 'ares_demo_mode';

// Audit log entry type
export interface AuditLogEntry {
  id: string;
  user_id: string;
  user_email: string;
  action: string;
  resource_type: 'campaign' | 'tactic' | 'payload' | 'export' | 'user' | 'session';
  resource_id?: string;
  details?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  timestamp: string;
  session_id?: string;
}

export class AuthService {
  // For demo purposes, create a mock user
  private static createDemoUser(role: UserRole = UserRole.ANALYST): User {
    return {
      id: 'demo_user_' + Date.now(),
      email: `${role}@demo.ares.local`,
      name: `Demo ${role.replace('_', ' ').toUpperCase()}`,
      role,
      created_at: new Date().toISOString(),
      last_login: new Date().toISOString()
    };
  }

  // Initialize demo session
  static initDemoSession(role: UserRole = UserRole.ANALYST): Session {
    const user = this.createDemoUser(role);
    const session: Session = {
      token: 'demo_token_' + Math.random().toString(36).substr(2, 9),
      refresh_token: 'demo_refresh_' + Math.random().toString(36).substr(2, 9),
      user,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      device_info: {
        user_agent: navigator.userAgent,
        ip_address: '127.0.0.1', // Demo IP
        device_id: 'demo_device_' + Date.now()
      }
    };

    this.saveSession(session);
    this.logAuditEvent({
      user_id: user.id,
      user_email: user.email,
      action: 'login',
      resource_type: 'session',
      details: { demo_mode: true, role }
    });

    return session;
  }

  // Save session to localStorage
  static saveSession(session: Session): void {
    try {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
      localStorage.setItem(DEMO_MODE_KEY, 'true');
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

  // Check if in demo mode
  static isDemoMode(): boolean {
    return localStorage.getItem(DEMO_MODE_KEY) === 'true';
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
    localStorage.removeItem(DEMO_MODE_KEY);
  }

  // Refresh session token (mock implementation)
  static async refreshSession(): Promise<Session | null> {
    const currentSession = this.getSession();
    if (!currentSession) return null;

    // In a real implementation, this would call an API
    const newSession: Session = {
      ...currentSession,
      token: 'demo_token_' + Math.random().toString(36).substr(2, 9),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };

    this.saveSession(newSession);
    return newSession;
  }

  // Audit logging
  static logAuditEvent(event: Omit<AuditLogEntry, 'id' | 'timestamp' | 'ip_address' | 'user_agent' | 'session_id'>): void {
    const session = this.getSession();
    const auditEntry: AuditLogEntry = {
      id: 'audit_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      ...event,
      timestamp: new Date().toISOString(),
      ip_address: session?.device_info?.ip_address || 'unknown',
      user_agent: navigator.userAgent,
      session_id: session?.token
    };

    // Store in localStorage (in production, this would go to a backend)
    this.saveAuditLog(auditEntry);
  }

  private static saveAuditLog(entry: AuditLogEntry): void {
    try {
      const logs = this.getAuditLogs();
      logs.unshift(entry); // Add to beginning
      
      // Keep only last 1000 entries in localStorage
      const trimmedLogs = logs.slice(0, 1000);
      localStorage.setItem('ares_audit_logs', JSON.stringify(trimmedLogs));
    } catch (error) {
      console.error('Failed to save audit log:', error);
    }
  }

  // Get audit logs
  static getAuditLogs(filters?: {
    user_id?: string;
    action?: string;
    resource_type?: string;
    since?: Date;
  }): AuditLogEntry[] {
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
    } catch (error) {
      console.error('Failed to load audit logs:', error);
      return [];
    }
  }

  // Export audit logs for compliance
  static exportAuditLogs(format: 'json' | 'csv' = 'json'): string {
    const logs = this.getAuditLogs();
    
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

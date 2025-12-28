import { describe, it, expect, vi, beforeEach } from 'vitest';
import { audit, auditFromRequest } from '../../utils/audit';
import { AuditLogRepository } from '../../repositories/auditLogRepository';

// Mock the AuditLogRepository
vi.mock('../../repositories/auditLogRepository', () => ({
  AuditLogRepository: {
    create: vi.fn()
  }
}));

describe('Audit Helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('audit', () => {
    it('should create an audit log entry with all parameters', async () => {
      const mockCreate = vi.mocked(AuditLogRepository.create);
      mockCreate.mockResolvedValue({
        id: 'audit_123',
        actorId: 'user_123',
        action: 'campaign_created',
        target: 'campaign_456',
        details: { name: 'Test Campaign' },
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        timestamp: new Date(),
        actor: {
          id: 'user_123',
          email: 'test@example.com',
          name: 'Test User',
          role: 'admin',
          orgId: 'org_123',
          createdAt: new Date(),
          updatedAt: new Date(),
          lastLogin: null
        }
      });

      await audit(
        'user_123',
        'campaign_created',
        'campaign_456',
        { name: 'Test Campaign' },
        '192.168.1.1',
        'Mozilla/5.0'
      );

      expect(mockCreate).toHaveBeenCalledWith({
        actorId: 'user_123',
        action: 'campaign_created',
        target: 'campaign_456',
        details: { name: 'Test Campaign' },
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0'
      });
    });

    it('should create an audit log entry with minimal parameters', async () => {
      const mockCreate = vi.mocked(AuditLogRepository.create);
      mockCreate.mockResolvedValue({
        id: 'audit_123',
        actorId: 'user_123',
        action: 'login',
        target: 'user_123',
        details: {},
        ipAddress: undefined,
        userAgent: undefined,
        timestamp: new Date(),
        actor: {
          id: 'user_123',
          email: 'test@example.com',
          name: 'Test User',
          role: 'admin',
          orgId: 'org_123',
          createdAt: new Date(),
          updatedAt: new Date(),
          lastLogin: null
        }
      });

      await audit('user_123', 'login', 'user_123');

      expect(mockCreate).toHaveBeenCalledWith({
        actorId: 'user_123',
        action: 'login',
        target: 'user_123',
        details: {},
        ipAddress: undefined,
        userAgent: undefined
      });
    });

    it('should handle audit logging failures gracefully', async () => {
      const mockCreate = vi.mocked(AuditLogRepository.create);
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      mockCreate.mockRejectedValue(new Error('Database connection failed'));

      // Should not throw - audit failures should not break operations
      await expect(
        audit('user_123', 'test_action', 'target_123')
      ).resolves.not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('auditFromRequest', () => {
    it('should extract IP and User-Agent from request headers', async () => {
      const mockCreate = vi.mocked(AuditLogRepository.create);
      mockCreate.mockResolvedValue({
        id: 'audit_123',
        actorId: 'user_123',
        action: 'export_data',
        target: 'campaigns',
        details: { format: 'json' },
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        timestamp: new Date(),
        actor: {
          id: 'user_123',
          email: 'test@example.com',
          name: 'Test User',
          role: 'admin',
          orgId: 'org_123',
          createdAt: new Date(),
          updatedAt: new Date(),
          lastLogin: null
        }
      });

      const mockRequest = {
        headers: {
          'x-forwarded-for': '192.168.1.1',
          'user-agent': 'Mozilla/5.0'
        }
      };

      await auditFromRequest(
        mockRequest,
        'user_123',
        'export_data',
        'campaigns',
        { format: 'json' }
      );

      expect(mockCreate).toHaveBeenCalledWith({
        actorId: 'user_123',
        action: 'export_data',
        target: 'campaigns',
        details: { format: 'json' },
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0'
      });
    });

    it('should use x-real-ip header if x-forwarded-for is not present', async () => {
      const mockCreate = vi.mocked(AuditLogRepository.create);
      mockCreate.mockResolvedValue({
        id: 'audit_123',
        actorId: 'user_123',
        action: 'test_action',
        target: 'target_123',
        details: {},
        ipAddress: '10.0.0.1',
        userAgent: undefined,
        timestamp: new Date(),
        actor: {
          id: 'user_123',
          email: 'test@example.com',
          name: 'Test User',
          role: 'admin',
          orgId: 'org_123',
          createdAt: new Date(),
          updatedAt: new Date(),
          lastLogin: null
        }
      });

      const mockRequest = {
        headers: {
          'x-real-ip': '10.0.0.1'
        }
      };

      await auditFromRequest(
        mockRequest,
        'user_123',
        'test_action',
        'target_123'
      );

      expect(mockCreate).toHaveBeenCalledWith({
        actorId: 'user_123',
        action: 'test_action',
        target: 'target_123',
        details: {},
        ipAddress: '10.0.0.1',
        userAgent: undefined
      });
    });

    it('should handle missing headers gracefully', async () => {
      const mockCreate = vi.mocked(AuditLogRepository.create);
      mockCreate.mockResolvedValue({
        id: 'audit_123',
        actorId: 'user_123',
        action: 'test_action',
        target: 'target_123',
        details: {},
        ipAddress: undefined,
        userAgent: undefined,
        timestamp: new Date(),
        actor: {
          id: 'user_123',
          email: 'test@example.com',
          name: 'Test User',
          role: 'admin',
          orgId: 'org_123',
          createdAt: new Date(),
          updatedAt: new Date(),
          lastLogin: null
        }
      });

      const mockRequest = {
        headers: {}
      };

      await auditFromRequest(
        mockRequest,
        'user_123',
        'test_action',
        'target_123'
      );

      expect(mockCreate).toHaveBeenCalledWith({
        actorId: 'user_123',
        action: 'test_action',
        target: 'target_123',
        details: {},
        ipAddress: undefined,
        userAgent: undefined
      });
    });
  });
});

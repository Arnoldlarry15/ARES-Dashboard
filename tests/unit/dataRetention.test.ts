import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanupAuditLogs, getRetentionStats, isPromptStorageEnabled } from '../../utils/dataRetention';
import { AuditLogRepository } from '../../repositories/auditLogRepository';

// Mock the AuditLogRepository
vi.mock('../../repositories/auditLogRepository', () => ({
  AuditLogRepository: {
    deleteOlderThan: vi.fn(),
    count: vi.fn()
  }
}));

describe('Data Retention Utilities', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment to default values
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('isPromptStorageEnabled', () => {
    it('should return false when PROMPT_STORAGE is not set', () => {
      delete process.env.PROMPT_STORAGE;
      expect(isPromptStorageEnabled()).toBe(false);
    });

    it('should return false when PROMPT_STORAGE is false', () => {
      process.env.PROMPT_STORAGE = 'false';
      expect(isPromptStorageEnabled()).toBe(false);
    });

    it('should return true when PROMPT_STORAGE is true', () => {
      process.env.PROMPT_STORAGE = 'true';
      expect(isPromptStorageEnabled()).toBe(true);
    });

    it('should return false for any value other than "true"', () => {
      process.env.PROMPT_STORAGE = 'yes';
      expect(isPromptStorageEnabled()).toBe(false);
    });
  });

  describe('cleanupAuditLogs', () => {
    it('should cleanup logs older than retention period (default 365 days)', async () => {
      const mockDeleteOlderThan = vi.mocked(AuditLogRepository.deleteOlderThan);
      mockDeleteOlderThan.mockResolvedValue({ count: 100 });

      const result = await cleanupAuditLogs();

      expect(result).toBe(100);
      expect(mockDeleteOlderThan).toHaveBeenCalledOnce();
      
      // Check that cutoff date is approximately 365 days ago
      const callArg = mockDeleteOlderThan.mock.calls[0][0];
      const expectedDate = new Date();
      expectedDate.setDate(expectedDate.getDate() - 365);
      
      // Allow 1 second difference for test execution time
      const dateDiff = Math.abs(callArg.getTime() - expectedDate.getTime());
      expect(dateDiff).toBeLessThan(1000);
    });

    it('should use custom retention period from environment', async () => {
      process.env.AUDIT_RETENTION_DAYS = '90';
      
      const mockDeleteOlderThan = vi.mocked(AuditLogRepository.deleteOlderThan);
      mockDeleteOlderThan.mockResolvedValue({ count: 50 });

      const result = await cleanupAuditLogs();

      expect(result).toBe(50);
      
      // Check that cutoff date is approximately 90 days ago
      const callArg = mockDeleteOlderThan.mock.calls[0][0];
      const expectedDate = new Date();
      expectedDate.setDate(expectedDate.getDate() - 90);
      
      const dateDiff = Math.abs(callArg.getTime() - expectedDate.getTime());
      expect(dateDiff).toBeLessThan(1000);
    });

    it('should not cleanup logs when retention is set to 0 (indefinite)', async () => {
      process.env.AUDIT_RETENTION_DAYS = '0';
      
      const mockDeleteOlderThan = vi.mocked(AuditLogRepository.deleteOlderThan);
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const result = await cleanupAuditLogs();

      expect(result).toBe(0);
      expect(mockDeleteOlderThan).not.toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Audit retention set to indefinite - no cleanup performed'
      );

      consoleLogSpy.mockRestore();
    });

    it('should handle invalid retention day values', async () => {
      process.env.AUDIT_RETENTION_DAYS = 'invalid';
      
      const mockDeleteOlderThan = vi.mocked(AuditLogRepository.deleteOlderThan);
      mockDeleteOlderThan.mockResolvedValue({ count: 10 });

      const result = await cleanupAuditLogs();

      // Should default to 365 days when value is invalid
      expect(result).toBe(10);
      expect(mockDeleteOlderThan).toHaveBeenCalledOnce();
    });

    it('should propagate errors from repository', async () => {
      const mockDeleteOlderThan = vi.mocked(AuditLogRepository.deleteOlderThan);
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      mockDeleteOlderThan.mockRejectedValue(new Error('Database error'));

      await expect(cleanupAuditLogs()).rejects.toThrow('Database error');
      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('getRetentionStats', () => {
    it('should return correct statistics with default retention period', async () => {
      const mockCount = vi.mocked(AuditLogRepository.count);
      mockCount
        .mockResolvedValueOnce(1000) // total logs
        .mockResolvedValueOnce(200); // old logs

      const stats = await getRetentionStats();

      expect(stats.retentionDays).toBe(365);
      expect(stats.totalLogs).toBe(1000);
      expect(stats.oldLogs).toBe(200);
      expect(stats.retainedLogs).toBe(800);
      expect(stats.cutoffDate).toBeInstanceOf(Date);
      
      // Check cutoff date is approximately 365 days ago
      const expectedDate = new Date();
      expectedDate.setDate(expectedDate.getDate() - 365);
      const dateDiff = Math.abs(stats.cutoffDate!.getTime() - expectedDate.getTime());
      expect(dateDiff).toBeLessThan(1000);
    });

    it('should return null cutoffDate when retention is indefinite', async () => {
      process.env.AUDIT_RETENTION_DAYS = '0';
      
      const mockCount = vi.mocked(AuditLogRepository.count);
      mockCount
        .mockResolvedValueOnce(500) // total logs
        .mockResolvedValueOnce(0); // old logs

      const stats = await getRetentionStats();

      expect(stats.retentionDays).toBe(0);
      expect(stats.cutoffDate).toBeNull();
      expect(stats.totalLogs).toBe(500);
      expect(stats.oldLogs).toBe(0);
      expect(stats.retainedLogs).toBe(500);
    });

    it('should use custom retention period from environment', async () => {
      process.env.AUDIT_RETENTION_DAYS = '30';
      
      const mockCount = vi.mocked(AuditLogRepository.count);
      mockCount
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(20);

      const stats = await getRetentionStats();

      expect(stats.retentionDays).toBe(30);
      expect(stats.totalLogs).toBe(100);
      expect(stats.oldLogs).toBe(20);
      expect(stats.retainedLogs).toBe(80);
    });
  });
});

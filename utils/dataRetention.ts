// Data Retention and Cleanup Utilities
// Handles compliance-focused data lifecycle management

import { AuditLogRepository } from '../repositories/auditLogRepository';

/**
 * Get audit retention days from environment config
 * Defaults to 365 days (1 year) for SOC2 compliance
 * Set to 0 for indefinite retention
 */
function getAuditRetentionDays(): number {
  const days = parseInt(process.env.AUDIT_RETENTION_DAYS || '365', 10);
  return isNaN(days) ? 365 : days;
}

/**
 * Check if prompt storage is enabled
 * Defaults to false (opt-in) for privacy compliance
 */
export function isPromptStorageEnabled(): boolean {
  return process.env.PROMPT_STORAGE === 'true';
}

/**
 * Clean up old audit logs based on retention policy
 * 
 * Deletes audit logs older than AUDIT_RETENTION_DAYS.
 * Returns the number of deleted records.
 * 
 * @returns Promise<number> - Number of deleted audit log entries
 * 
 * @example
 * // Clean up logs older than retention period
 * const deleted = await cleanupAuditLogs();
 * console.log(`Deleted ${deleted} old audit logs`);
 */
export async function cleanupAuditLogs(): Promise<number> {
  const retentionDays = getAuditRetentionDays();
  
  // If retention is 0, keep all logs indefinitely
  if (retentionDays === 0) {
    console.log('Audit retention set to indefinite - no cleanup performed');
    return 0;
  }

  // Calculate cutoff date
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  try {
    const result = await AuditLogRepository.deleteOlderThan(cutoffDate);
    console.log(`Cleaned up ${result.count} audit logs older than ${cutoffDate.toISOString()}`);
    return result.count;
  } catch (error) {
    console.error('Failed to cleanup audit logs:', error);
    throw error;
  }
}

/**
 * Get statistics about audit log retention
 * 
 * @returns Promise<object> - Statistics about audit logs
 */
export async function getRetentionStats() {
  const retentionDays = getAuditRetentionDays();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const totalLogs = await AuditLogRepository.count();
  const oldLogs = await AuditLogRepository.count({
    endDate: cutoffDate
  });

  return {
    retentionDays,
    cutoffDate: retentionDays > 0 ? cutoffDate : null,
    totalLogs,
    oldLogs,
    retainedLogs: totalLogs - oldLogs
  };
}

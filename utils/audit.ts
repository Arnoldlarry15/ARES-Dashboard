// Centralized Audit Logging Helper
// Provides SOC2-compliant audit trail for all sensitive actions

import { AuditLogRepository } from '../repositories/auditLogRepository';
import type { Prisma } from '@prisma/client';

export interface AuditContext {
  actorId: string;
  action: string;
  target: string;
  details?: Prisma.InputJsonValue;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Centralized audit logging function
 * 
 * Logs every sensitive action with immutable, server-side storage.
 * Never editable - provides forensics-ready evidence for SOC2 compliance.
 * 
 * @param actorId - User ID performing the action
 * @param action - Action being performed (e.g., 'campaign_created', 'export_data', 'ai_generated')
 * @param target - Target entity ID or resource identifier
 * @param details - Additional context (optional)
 * @param ipAddress - IP address of the actor (optional)
 * @param userAgent - User agent string (optional)
 * 
 * @example
 * await audit('user_123', 'campaign_created', 'campaign_456', { name: 'Test Campaign' });
 * await audit('user_123', 'export_data', 'campaigns', { format: 'json', count: 5 });
 * await audit('user_123', 'ai_generated', 'tactic_LLM01', { framework: 'OWASP' });
 * await audit('user_123', 'permission_denied', 'campaigns:write', { reason: 'insufficient_role' });
 */
export async function audit(
  actorId: string,
  action: string,
  target: string,
  details?: Prisma.InputJsonValue,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  try {
    await AuditLogRepository.create({
      actorId,
      action,
      target,
      details: details || {},
      ipAddress,
      userAgent,
    });
  } catch (error) {
    // Log error but don't throw - audit failures shouldn't break operations
    console.error('Audit logging failed:', error);
  }
}

/**
 * Audit helper with context extraction from request
 * Automatically extracts IP and User-Agent from request object
 */
export async function auditFromRequest(
  req: { headers: Record<string, string | string[] | undefined> },
  actorId: string,
  action: string,
  target: string,
  details?: Prisma.InputJsonValue
): Promise<void> {
  const ipAddress = 
    (req.headers['x-forwarded-for'] as string) || 
    (req.headers['x-real-ip'] as string) || 
    undefined;
  const userAgent = req.headers['user-agent'] as string | undefined;

  await audit(actorId, action, target, details, ipAddress, userAgent);
}

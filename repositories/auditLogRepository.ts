// AuditLog Repository - Database operations for AuditLog model
import prisma from '../utils/db';
import type { Prisma } from '@prisma/client';

type DbClient = Prisma.TransactionClient | typeof prisma;

const ACTOR_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
} satisfies Prisma.UserSelect;

function requireOrgId(orgId: string | undefined, operation: string): string {
  if (typeof orgId !== 'string' || !orgId.trim()) {
    throw new Error(`orgId is required for AuditLogRepository.${operation}`);
  }
  return orgId.trim();
}

export interface CreateAuditLogInput {
  orgId: string;
  actorId: string;
  action: string;
  target: string;
  details?: Prisma.InputJsonValue;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditLogFilter {
  orgId: string;
  actorId?: string;
  action?: string;
  startDate?: Date;
  endDate?: Date;
}

export class AuditLogRepository {
  private static buildWhere(filter: AuditLogFilter, operation: string): Prisma.AuditLogWhereInput {
    const orgId = requireOrgId(filter?.orgId, operation);
    const where: Prisma.AuditLogWhereInput = { orgId };

    if (filter.actorId) {
      where.actorId = filter.actorId;
    }

    if (filter.action) {
      where.action = filter.action;
    }

    if (filter.startDate || filter.endDate) {
      where.timestamp = {};
      if (filter.startDate) {
        where.timestamp.gte = filter.startDate;
      }
      if (filter.endDate) {
        where.timestamp.lte = filter.endDate;
      }
    }

    return where;
  }

  // Create audit log entry (append-only)
  static async create(data: CreateAuditLogInput, tx: DbClient = prisma) {
    const orgId = requireOrgId(data.orgId, 'create');
    return await tx.auditLog.create({
      data: {
        orgId,
        actorId: data.actorId,
        action: data.action,
        target: data.target,
        details: data.details || {},
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      },
      include: {
        actor: {
          select: ACTOR_SELECT,
        },
      },
    });
  }

  // Get audit logs with filters (org-scoped)
  static async findMany(filter: AuditLogFilter, options?: { skip?: number; take?: number }) {
    const where = this.buildWhere(filter, 'findMany');

    return await prisma.auditLog.findMany({
      where,
      include: {
        actor: {
          select: ACTOR_SELECT,
        },
      },
      orderBy: { timestamp: 'desc' },
      skip: options?.skip,
      take: options?.take,
    });
  }

  // Get audit log by ID (org-scoped)
  static async findById(id: string, orgId: string) {
    const validatedOrgId = requireOrgId(orgId, 'findById');
    return await prisma.auditLog.findFirst({
      where: { id, orgId: validatedOrgId },
      include: {
        actor: {
          select: ACTOR_SELECT,
        },
      },
    });
  }

  // Get audit logs for a specific user (org-scoped)
  static async findByActorId(actorId: string, orgId: string, options?: { skip?: number; take?: number }) {
    const validatedOrgId = requireOrgId(orgId, 'findByActorId');
    return await prisma.auditLog.findMany({
      where: { actorId, orgId: validatedOrgId },
      include: {
        actor: {
          select: ACTOR_SELECT,
        },
      },
      orderBy: { timestamp: 'desc' },
      skip: options?.skip,
      take: options?.take,
    });
  }

  // Get audit logs for a specific action type (org-scoped)
  static async findByAction(action: string, orgId: string, options?: { skip?: number; take?: number }) {
    const validatedOrgId = requireOrgId(orgId, 'findByAction');
    return await prisma.auditLog.findMany({
      where: { action, orgId: validatedOrgId },
      include: {
        actor: {
          select: ACTOR_SELECT,
        },
      },
      orderBy: { timestamp: 'desc' },
      skip: options?.skip,
      take: options?.take,
    });
  }

  // Count audit logs with filters (org-scoped)
  static async count(filter: AuditLogFilter) {
    const where = this.buildWhere(filter, 'count');

    return await prisma.auditLog.count({ where });
  }
}

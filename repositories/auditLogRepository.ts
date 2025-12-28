// AuditLog Repository - Database operations for AuditLog model
import prisma from '../utils/db';
import type { Prisma } from '@prisma/client';

export interface CreateAuditLogInput {
  actorId: string;
  action: string;
  target: string;
  details?: Prisma.InputJsonValue;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditLogFilter {
  actorId?: string;
  action?: string;
  startDate?: Date;
  endDate?: Date;
}

export class AuditLogRepository {
  // Create audit log entry
  static async create(data: CreateAuditLogInput) {
    return await prisma.auditLog.create({
      data: {
        actorId: data.actorId,
        action: data.action,
        target: data.target,
        details: data.details || {},
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
      },
      include: {
        actor: true,
      },
    });
  }

  // Get audit logs with filters
  static async findMany(filter?: AuditLogFilter, options?: { skip?: number; take?: number }) {
    const where: {
      actorId?: string;
      action?: string;
      timestamp?: {
        gte?: Date;
        lte?: Date;
      };
    } = {};

    if (filter?.actorId) {
      where.actorId = filter.actorId;
    }

    if (filter?.action) {
      where.action = filter.action;
    }

    if (filter?.startDate || filter?.endDate) {
      where.timestamp = {};
      if (filter.startDate) {
        where.timestamp.gte = filter.startDate;
      }
      if (filter.endDate) {
        where.timestamp.lte = filter.endDate;
      }
    }

    return await prisma.auditLog.findMany({
      where,
      include: {
        actor: true,
      },
      orderBy: { timestamp: 'desc' },
      skip: options?.skip,
      take: options?.take,
    });
  }

  // Get audit log by ID
  static async findById(id: string) {
    return await prisma.auditLog.findUnique({
      where: { id },
      include: {
        actor: true,
      },
    });
  }

  // Get audit logs for a specific user
  static async findByActorId(actorId: string, options?: { skip?: number; take?: number }) {
    return await prisma.auditLog.findMany({
      where: { actorId },
      include: {
        actor: true,
      },
      orderBy: { timestamp: 'desc' },
      skip: options?.skip,
      take: options?.take,
    });
  }

  // Get audit logs for a specific action type
  static async findByAction(action: string, options?: { skip?: number; take?: number }) {
    return await prisma.auditLog.findMany({
      where: { action },
      include: {
        actor: true,
      },
      orderBy: { timestamp: 'desc' },
      skip: options?.skip,
      take: options?.take,
    });
  }

  // Count audit logs with filters
  static async count(filter?: AuditLogFilter) {
    const where: {
      actorId?: string;
      action?: string;
      timestamp?: {
        gte?: Date;
        lte?: Date;
      };
    } = {};

    if (filter?.actorId) {
      where.actorId = filter.actorId;
    }

    if (filter?.action) {
      where.action = filter.action;
    }

    if (filter?.startDate || filter?.endDate) {
      where.timestamp = {};
      if (filter.startDate) {
        where.timestamp.gte = filter.startDate;
      }
      if (filter.endDate) {
        where.timestamp.lte = filter.endDate;
      }
    }

    return await prisma.auditLog.count({ where });
  }

  // Delete old audit logs (for cleanup)
  static async deleteOlderThan(date: Date) {
    return await prisma.auditLog.deleteMany({
      where: {
        timestamp: {
          lt: date,
        },
      },
    });
  }
}

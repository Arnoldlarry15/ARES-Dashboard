// User Repository - Database operations for User model
import crypto from 'node:crypto';
import type { Prisma } from '@prisma/client';
import prisma from '../utils/db';

type DbClient = Prisma.TransactionClient | typeof prisma;

export const ALLOWED_INVITATION_ROLES = ['admin', 'red_team_lead', 'analyst', 'viewer'] as const;
export type InvitationRole = (typeof ALLOWED_INVITATION_ROLES)[number];

function isPrismaUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function truncateUserAgent(userAgent?: string): string | undefined {
  if (typeof userAgent !== 'string') return undefined;
  return userAgent.length > 500 ? userAgent.slice(0, 500) : userAgent;
}

export interface CreateUserInput {
  email: string;
  name?: string;
  role: string;
  orgId: string;
}

export interface UpdateUserInput {
  name?: string;
  role?: string;
  lastLogin?: Date;
}

function requireOrgId(orgId: string): string {
  if (typeof orgId !== 'string' || !orgId.trim()) {
    throw new Error('Organization ID (orgId) is required for tenant-scoped user operations');
  }
  const trimmed = orgId.trim();
  if (trimmed === 'default_org') {
    throw new Error('LEGACY_ORG_MIGRATION_REQUIRED: Legacy default_org membership must be migrated');
  }
  return trimmed;
}

export class UserRepository {
  // Create a new user
  static async create(data: CreateUserInput, tx: DbClient = prisma) {
    const orgId = requireOrgId(data.orgId);
    if (orgId === 'default_org') {
      throw new Error('Explicit organization ID is required');
    }
    return await tx.user.create({
      data: {
        email: normalizeEmail(data.email),
        name: data.name,
        role: data.role,
        orgId,
      },
    });
  }

  // Find user by ID (auth/internal use only; API routes should use findByIdInOrg)
  static async findById(id: string) {
    return await prisma.user.findUnique({
      where: { id },
    });
  }

  // Find user by ID scoped to an organization
  static async findByIdInOrg(id: string, orgId: string, tx: DbClient = prisma) {
    const scopedOrgId = requireOrgId(orgId);
    return await tx.user.findFirst({
      where: { id, orgId: scopedOrgId, disabledAt: null },
    });
  }

  // Find user by email (auth/internal use only; API routes should use findByEmailInOrg)
  static async findByEmail(email: string) {
    return await prisma.user.findUnique({
      where: { email: normalizeEmail(email) },
    });
  }

  // Find user by email scoped to an organization
  static async findByEmailInOrg(email: string, orgId: string) {
    const scopedOrgId = requireOrgId(orgId);
    return await prisma.user.findFirst({
      where: { email: normalizeEmail(email), orgId: scopedOrgId, disabledAt: null },
    });
  }

  // Find user by immutable Auth0 subject
  static async findByAuth0Sub(auth0Sub: string) {
    return await prisma.user.findUnique({
      where: { auth0Sub },
    });
  }

  /**
   * Resolve or provision an Auth0 user safely:
   * - Never auto-links pre-existing accounts by email alone.
   * - Requires verified email for first-time provisioning.
   * - Preserves authoritative DB role on returning users.
   */
  static async resolveAuth0User(
    params: {
      sub: string;
      email?: string;
      emailVerified: boolean;
      name?: string;
      orgId?: string;
    },
    tx: DbClient = prisma
  ) {
    const normalizedEmail =
      typeof params.email === 'string' && params.email.trim() ? normalizeEmail(params.email) : undefined;

    const existingBySub = await tx.user.findUnique({
      where: { auth0Sub: params.sub },
    });

    if (existingBySub) {
      if (existingBySub.disabledAt) {
        throw new Error('USER_DEACTIVATED: Account has been deactivated');
      }
      if (existingBySub.orgId === 'default_org') {
        throw new Error('LEGACY_ORG_MIGRATION_REQUIRED: Legacy default_org membership must be migrated');
      }
      if (normalizedEmail && params.emailVerified && normalizedEmail !== normalizeEmail(existingBySub.email)) {
        return await tx.user.update({
          where: { id: existingBySub.id },
          data: {
            email: normalizedEmail,
            emailVerified: true,
            lastLogin: new Date(),
          },
        });
      }
      return await tx.user.update({
        where: { id: existingBySub.id },
        data: { lastLogin: new Date() },
      });
    }

    if (!normalizedEmail || !params.emailVerified) {
      throw new Error('Verified email claim is required to provision a new Auth0 account');
    }

    const existingByEmail = await tx.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingByEmail) {
      throw new Error('Account with this email exists without Auth0 link; explicit account linking required');
    }

    const normalizedOrgId = typeof params.orgId === 'string' ? params.orgId.trim() : '';
    if (!normalizedOrgId) {
      throw new Error('ONBOARDING_REQUIRED: Explicit organization onboarding or invitation is required');
    }
    if (normalizedOrgId === 'default_org') {
      throw new Error('LEGACY_ORG_MIGRATION_REQUIRED: Legacy default_org membership must be migrated');
    }

    try {
      await tx.organization.upsert({
        where: { id: normalizedOrgId },
        update: {},
        create: {
          id: normalizedOrgId,
          name: normalizedOrgId,
          createdBy: params.sub,
        },
      });

      return await tx.user.create({
        data: {
          auth0Sub: params.sub,
          email: normalizedEmail,
          emailVerified: true,
          name: params.name || normalizedEmail,
          role: 'analyst',
          orgId: normalizedOrgId,
          lastLogin: new Date(),
        },
      });
    } catch (err) {
      if (isPrismaUniqueViolation(err)) {
        const raced = await tx.user.findUnique({
          where: { auth0Sub: params.sub },
        });
        if (raced) {
          if (raced.disabledAt) {
            throw new Error('USER_DEACTIVATED: Account has been deactivated');
          }
          if (raced.orgId === 'default_org') {
            throw new Error('LEGACY_ORG_MIGRATION_REQUIRED: Legacy default_org membership must be migrated');
          }
          return raced;
        }
      }
      throw err;
    }
  }

  /**
   * Atomically create a new Organization and its initial admin User during onboarding.
   */
  static async createOrganizationWithAdmin(params: {
    auth0Sub: string;
    email: string;
    name?: string;
    organizationName: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const auth0Sub = typeof params.auth0Sub === 'string' ? params.auth0Sub.trim() : '';
    const email = typeof params.email === 'string' ? normalizeEmail(params.email) : '';
    const organizationName = typeof params.organizationName === 'string' ? params.organizationName.trim() : '';
    const userAgent = truncateUserAgent(params.userAgent);

    if (!auth0Sub || !email || !organizationName) {
      throw new Error('auth0Sub, email, and organizationName are required');
    }

    try {
      return await prisma.$transaction(async (tx) => {
        const existingBySub = await tx.user.findUnique({
          where: { auth0Sub },
        });
        if (existingBySub) {
          if (existingBySub.disabledAt !== null) {
            throw new Error('USER_DEACTIVATED: Account has been deactivated');
          }
          throw new Error('ALREADY_PROVISIONED: Account is already provisioned or cannot be onboarded');
        }

        const existingByEmail = await tx.user.findUnique({
          where: { email },
        });
        if (existingByEmail) {
          if (existingByEmail.disabledAt !== null) {
            throw new Error('USER_DEACTIVATED: Account has been deactivated');
          }
          throw new Error('ALREADY_PROVISIONED: Account is already provisioned or cannot be onboarded');
        }

        const orgId = `org_${crypto.randomBytes(16).toString('hex')}`;

        const organization = await tx.organization.create({
          data: {
            id: orgId,
            name: organizationName,
            createdBy: auth0Sub,
          },
        });

        const user = await tx.user.create({
          data: {
            auth0Sub,
            email,
            emailVerified: true,
            name: params.name?.trim() || email,
            role: 'admin',
            orgId,
            lastLogin: new Date(),
          },
        });

        await tx.auditLog.create({
          data: {
            orgId,
            actorId: user.id,
            action: 'organization_created',
            target: orgId,
            details: { organizationName },
            ipAddress: params.ipAddress,
            userAgent,
          },
        });

        await tx.auditLog.create({
          data: {
            orgId,
            actorId: user.id,
            action: 'user_created',
            target: user.id,
            details: { role: 'admin', via: 'onboarding_create_org' },
            ipAddress: params.ipAddress,
            userAgent,
          },
        });

        return { organization, user };
      });
    } catch (err) {
      if (isPrismaUniqueViolation(err)) {
        throw new Error('ALREADY_PROVISIONED: Account is already provisioned or cannot be onboarded');
      }
      throw err;
    }
  }

  /**
   * Create a single-use organization invitation (stores SHA-256 hash of token).
   */
  static async createInvitation(
    params: {
      orgId: string;
      invitedEmail?: string;
      role: string;
      createdBy: string;
      expiresInHours?: number;
    },
    tx: DbClient = prisma
  ) {
    const orgId = requireOrgId(params.orgId);
    if (!ALLOWED_INVITATION_ROLES.includes(params.role as InvitationRole)) {
      throw new Error(`INVALID_ROLE: Role must be one of ${ALLOWED_INVITATION_ROLES.join(', ')}`);
    }

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const hours = typeof params.expiresInHours === 'number' && params.expiresInHours > 0 ? params.expiresInHours : 72;
    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000);
    const invitedEmail = params.invitedEmail?.trim() ? normalizeEmail(params.invitedEmail) : null;

    const invitation = await tx.organizationInvitation.create({
      data: {
        tokenHash,
        orgId,
        invitedEmail,
        role: params.role,
        createdBy: params.createdBy,
        expiresAt,
      },
    });

    return { invitation, token };
  }

  /**
   * Atomically claim and redeem a single-use organization invitation.
   */
  static async acceptInvitation(params: {
    token: string;
    auth0Sub: string;
    email: string;
    name?: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    const rawToken = typeof params.token === 'string' ? params.token.trim() : '';
    const auth0Sub = typeof params.auth0Sub === 'string' ? params.auth0Sub.trim() : '';
    const email = typeof params.email === 'string' ? normalizeEmail(params.email) : '';
    const userAgent = truncateUserAgent(params.userAgent);

    if (!rawToken || !auth0Sub || !email) {
      throw new Error('token, auth0Sub, and email are required');
    }

    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    try {
      return await prisma.$transaction(async (tx) => {
        const existingBySub = await tx.user.findUnique({
          where: { auth0Sub },
        });
        if (existingBySub) {
          if (existingBySub.disabledAt !== null) {
            throw new Error('USER_DEACTIVATED: Account has been deactivated');
          }
          throw new Error('ALREADY_PROVISIONED: Account is already provisioned or cannot be onboarded');
        }

        const existingByEmail = await tx.user.findUnique({
          where: { email },
        });
        if (existingByEmail) {
          if (existingByEmail.disabledAt !== null) {
            throw new Error('USER_DEACTIVATED: Account has been deactivated');
          }
          throw new Error('ALREADY_PROVISIONED: Account is already provisioned or cannot be onboarded');
        }

        const claimed = await tx.organizationInvitation.updateMany({
          where: {
            tokenHash,
            usedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: {
            usedAt: new Date(),
            usedBy: auth0Sub,
          },
        });

        if (claimed.count !== 1) {
          throw new Error('INVALID_OR_EXPIRED_INVITATION: Invitation token is invalid, expired, or already used');
        }

        const invitation = await tx.organizationInvitation.findUnique({
          where: { tokenHash },
        });

        if (!invitation) {
          throw new Error('INVALID_OR_EXPIRED_INVITATION: Invitation token is invalid, expired, or already used');
        }
        if (invitation.orgId === 'default_org') {
          throw new Error('LEGACY_ORG_MIGRATION_REQUIRED: Legacy default_org membership must be migrated');
        }
        if (invitation.invitedEmail && invitation.invitedEmail.toLowerCase() !== email.toLowerCase()) {
          throw new Error('INVITATION_EMAIL_MISMATCH: Invitation is restricted to a different email address');
        }

        const inviter = await tx.user.findUnique({
          where: { id: invitation.createdBy },
          select: { id: true, orgId: true, disabledAt: true },
        });
        if (inviter && (inviter.disabledAt !== null || inviter.orgId !== invitation.orgId)) {
          throw new Error('INVALID_OR_EXPIRED_INVITATION: Invitation token is invalid, expired, or already used');
        }

        const user = await tx.user.create({
          data: {
            auth0Sub,
            email,
            emailVerified: true,
            name: params.name?.trim() || email,
            role: invitation.role,
            orgId: invitation.orgId,
            lastLogin: new Date(),
          },
        });

        await tx.auditLog.create({
          data: {
            orgId: invitation.orgId,
            actorId: user.id,
            action: 'invitation_accepted',
            target: invitation.id,
            details: {
              role: invitation.role,
              invitedEmail: invitation.invitedEmail,
            },
            ipAddress: params.ipAddress,
            userAgent,
          },
        });

        return { user, invitation };
      });
    } catch (err) {
      if (isPrismaUniqueViolation(err)) {
        throw new Error('ALREADY_PROVISIONED: Account is already provisioned or cannot be onboarded');
      }
      throw err;
    }
  }

  /**
   * List invitations for an organization (never returns tokenHash).
   */
  static async listInvitations(orgId: string) {
    const scopedOrgId = requireOrgId(orgId);
    return await prisma.organizationInvitation.findMany({
      where: { orgId: scopedOrgId },
      select: {
        id: true,
        orgId: true,
        invitedEmail: true,
        role: true,
        createdBy: true,
        expiresAt: true,
        usedAt: true,
        usedBy: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Revoke (delete) an invitation scoped to an organization.
   */
  static async revokeInvitation(id: string, orgId: string, tx: DbClient = prisma): Promise<boolean> {
    const scopedOrgId = requireOrgId(orgId);
    const result = await tx.organizationInvitation.deleteMany({
      where: { id, orgId: scopedOrgId },
    });
    return result.count > 0;
  }

  /**
   * Revoke all pending (unredeemed) invitations created by a user in an organization.
   */
  static async revokePendingInvitationsByCreator(
    createdBy: string,
    orgId: string,
    tx: DbClient = prisma
  ): Promise<number> {
    const scopedOrgId = requireOrgId(orgId);
    const client = tx as { organizationInvitation?: { deleteMany?: typeof prisma.organizationInvitation.deleteMany } };
    if (!client.organizationInvitation?.deleteMany) {
      return 0;
    }
    const result = await client.organizationInvitation.deleteMany({
      where: {
        orgId: scopedOrgId,
        createdBy,
        usedAt: null,
      },
    });
    return result.count;
  }

  /**
   * Fixed least-privilege local development user (non-production only).
   */
  static async findOrCreateLocalDevUser(tx: DbClient = prisma) {
    const email = 'dev-analyst@local.ares.app';
    await tx.organization.upsert({
      where: { id: 'local_dev_org' },
      update: {},
      create: {
        id: 'local_dev_org',
        name: 'Local Development Organization',
        createdBy: 'local_dev',
      },
    });
    const existing = await tx.user.findUnique({ where: { email } });
    if (existing) {
      if (existing.disabledAt) {
        throw new Error('USER_DEACTIVATED: Account has been deactivated');
      }
      return await tx.user.update({
        where: { id: existing.id },
        data: { lastLogin: new Date() },
      });
    }
    return await tx.user.create({
      data: {
        email,
        emailVerified: true,
        name: 'Local Dev Analyst',
        role: 'analyst',
        orgId: 'local_dev_org',
        lastLogin: new Date(),
      },
    });
  }

  // Acquire transaction-scoped advisory lock for organization admin mutations
  static async acquireOrgAdminLock(orgId: string, tx: DbClient = prisma): Promise<void> {
    const scopedOrgId = requireOrgId(orgId);
    if (typeof (tx as { $executeRaw?: unknown }).$executeRaw === 'function') {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`org_admin:${scopedOrgId}`}))`;
    }
  }

  // Get all active users in an organization
  static async findByOrgId(orgId: string) {
    const scopedOrgId = requireOrgId(orgId);
    return await prisma.user.findMany({
      where: { orgId: scopedOrgId, disabledAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Update user atomically within an organization
  static async updateInOrg(id: string, orgId: string, data: UpdateUserInput, tx: DbClient = prisma) {
    const scopedOrgId = requireOrgId(orgId);
    const result = await tx.user.updateMany({
      where: { id, orgId: scopedOrgId, disabledAt: null },
      data,
    });
    if (result.count === 0) {
      return null;
    }
    return await tx.user.findFirst({
      where: { id, orgId: scopedOrgId, disabledAt: null },
    });
  }

  // Update last login timestamp
  static async updateLastLogin(id: string) {
    return await prisma.user.update({
      where: { id },
      data: { lastLogin: new Date() },
    });
  }

  // Soft-delete (deactivate) user atomically within an organization
  static async deleteInOrg(id: string, orgId: string, tx: DbClient = prisma): Promise<boolean> {
    const scopedOrgId = requireOrgId(orgId);
    const result = await tx.user.updateMany({
      where: { id, orgId: scopedOrgId, disabledAt: null },
      data: { disabledAt: new Date() },
    });
    return result.count > 0;
  }

  // Count active administrators in an organization, excluding a specific user
  static async countActiveAdminsInOrg(orgId: string, excludeUserId: string, tx: DbClient = prisma): Promise<number> {
    const scopedOrgId = requireOrgId(orgId);
    return await tx.user.count({
      where: {
        orgId: scopedOrgId,
        role: 'admin',
        disabledAt: null,
        id: { not: excludeUserId },
      },
    });
  }

  // Get active user count by organization
  static async countByOrgId(orgId: string) {
    const scopedOrgId = requireOrgId(orgId);
    return await prisma.user.count({
      where: { orgId: scopedOrgId, disabledAt: null },
    });
  }
}

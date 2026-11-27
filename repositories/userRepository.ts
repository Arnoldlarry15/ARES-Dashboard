// User Repository - Database operations for User model
import prisma from '../utils/db';

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

export class UserRepository {
  // Create a new user
  static async create(data: CreateUserInput) {
    return await prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        role: data.role,
        orgId: data.orgId,
      },
    });
  }

  // Find user by ID
  static async findById(id: string) {
    return await prisma.user.findUnique({
      where: { id },
    });
  }

  // Find user by email
  static async findByEmail(email: string) {
    return await prisma.user.findUnique({
      where: { email },
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
  static async resolveAuth0User(params: {
    sub: string;
    email?: string;
    emailVerified: boolean;
    name?: string;
    orgId?: string;
  }) {
    const existingBySub = await prisma.user.findUnique({
      where: { auth0Sub: params.sub },
    });

    if (existingBySub) {
      if (params.email && params.emailVerified && params.email !== existingBySub.email) {
        return await prisma.user.update({
          where: { id: existingBySub.id },
          data: {
            email: params.email,
            emailVerified: true,
            lastLogin: new Date(),
          },
        });
      }
      return await prisma.user.update({
        where: { id: existingBySub.id },
        data: { lastLogin: new Date() },
      });
    }

    if (!params.email || !params.emailVerified) {
      throw new Error('Verified email claim is required to provision a new Auth0 account');
    }

    const existingByEmail = await prisma.user.findUnique({
      where: { email: params.email },
    });

    if (existingByEmail) {
      throw new Error('Account with this email exists without Auth0 link; explicit account linking required');
    }

    return await prisma.user.create({
      data: {
        auth0Sub: params.sub,
        email: params.email,
        emailVerified: true,
        name: params.name || params.email,
        role: 'analyst',
        orgId: params.orgId || 'default_org',
        lastLogin: new Date(),
      },
    });
  }

  /**
   * Fixed least-privilege local development user (non-production only).
   */
  static async findOrCreateLocalDevUser() {
    const email = 'dev-analyst@local.ares.app';
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return await prisma.user.update({
        where: { id: existing.id },
        data: { lastLogin: new Date() },
      });
    }
    return await prisma.user.create({
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

  // Get all users in an organization
  static async findByOrgId(orgId: string) {
    return await prisma.user.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Update user
  static async update(id: string, data: UpdateUserInput) {
    return await prisma.user.update({
      where: { id },
      data,
    });
  }

  // Update last login timestamp
  static async updateLastLogin(id: string) {
    return await prisma.user.update({
      where: { id },
      data: { lastLogin: new Date() },
    });
  }

  // Delete user (soft delete - can be extended)
  static async delete(id: string) {
    return await prisma.user.delete({
      where: { id },
    });
  }

  // Get user count by organization
  static async countByOrgId(orgId: string) {
    return await prisma.user.count({
      where: { orgId },
    });
  }
}

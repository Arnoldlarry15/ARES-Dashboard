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

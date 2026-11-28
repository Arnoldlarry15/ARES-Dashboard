// Campaign Repository - Database operations for Campaign model
import prisma from '../utils/db';
import type { Prisma } from '@prisma/client';

type DbClient = Prisma.TransactionClient | typeof prisma;

export interface CreateCampaignInput {
  name: string;
  description?: string;
  framework: string;
  tacticId: string;
  tacticName: string;
  createdBy: string;
  selectedVectors?: string[];
  selectedPayloadIndices?: number[];
  metadata?: Prisma.InputJsonValue;
}

export interface UpdateCampaignInput {
  name?: string;
  description?: string;
  framework?: string;
  tacticId?: string;
  tacticName?: string;
  selectedVectors?: string[];
  selectedPayloadIndices?: number[];
  metadata?: Prisma.InputJsonValue;
}

const CREATOR_SELECT = {
  select: {
    id: true,
    name: true,
    email: true,
    role: true,
    orgId: true,
  },
} as const;

function requireOrgId(orgId: string): string {
  if (typeof orgId !== 'string' || !orgId.trim()) {
    throw new Error('Organization ID (orgId) is required for tenant-scoped campaign operations');
  }
  return orgId.trim();
}

export class CampaignRepository {
  // Create a new campaign
  static async create(data: CreateCampaignInput, tx: DbClient = prisma) {
    return await tx.campaign.create({
      data: {
        name: data.name,
        description: data.description,
        framework: data.framework,
        tacticId: data.tacticId,
        tacticName: data.tacticName,
        createdBy: data.createdBy,
        selectedVectors: data.selectedVectors || [],
        selectedPayloadIndices: data.selectedPayloadIndices || [],
        metadata: data.metadata || {},
      },
      include: {
        creator: CREATOR_SELECT,
      },
    });
  }

  // Find campaign by ID scoped to an organization
  static async findById(id: string, orgId: string) {
    const scopedOrgId = requireOrgId(orgId);
    return await prisma.campaign.findFirst({
      where: {
        id,
        creator: { orgId: scopedOrgId },
      },
      include: {
        creator: CREATOR_SELECT,
      },
    });
  }

  // Get all campaigns by a user within an organization
  static async findByUserId(userId: string, orgId: string) {
    const scopedOrgId = requireOrgId(orgId);
    return await prisma.campaign.findMany({
      where: {
        createdBy: userId,
        creator: { orgId: scopedOrgId },
      },
      include: {
        creator: CREATOR_SELECT,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Get all campaigns in an organization (with pagination)
  static async findAll(options: { skip?: number; take?: number; orgId: string }) {
    const scopedOrgId = requireOrgId(options?.orgId);
    return await prisma.campaign.findMany({
      where: { creator: { orgId: scopedOrgId } },
      include: {
        creator: CREATOR_SELECT,
      },
      orderBy: { createdAt: 'desc' },
      skip: options.skip,
      take: options.take,
    });
  }

  // Update campaign atomically within an organization
  static async update(id: string, orgId: string, data: UpdateCampaignInput, tx: DbClient = prisma) {
    const scopedOrgId = requireOrgId(orgId);
    const updateData: Prisma.CampaignUpdateManyMutationInput = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.framework !== undefined) updateData.framework = data.framework;
    if (data.tacticId !== undefined) updateData.tacticId = data.tacticId;
    if (data.tacticName !== undefined) updateData.tacticName = data.tacticName;
    if (data.selectedVectors !== undefined) updateData.selectedVectors = data.selectedVectors;
    if (data.selectedPayloadIndices !== undefined) updateData.selectedPayloadIndices = data.selectedPayloadIndices;
    if (data.metadata !== undefined) updateData.metadata = data.metadata;

    const result = await tx.campaign.updateMany({
      where: {
        id,
        creator: { orgId: scopedOrgId },
      },
      data: updateData,
    });

    if (result.count === 0) {
      return null;
    }

    return await tx.campaign.findFirst({
      where: {
        id,
        creator: { orgId: scopedOrgId },
      },
      include: {
        creator: CREATOR_SELECT,
      },
    });
  }

  // Delete campaign atomically within an organization
  static async delete(id: string, orgId: string, tx: DbClient = prisma): Promise<boolean> {
    const scopedOrgId = requireOrgId(orgId);
    const result = await tx.campaign.deleteMany({
      where: {
        id,
        creator: { orgId: scopedOrgId },
      },
    });
    return result.count > 0;
  }

  // Count campaigns by user within an organization
  static async countByUserId(userId: string, orgId: string) {
    const scopedOrgId = requireOrgId(orgId);
    return await prisma.campaign.count({
      where: {
        createdBy: userId,
        creator: { orgId: scopedOrgId },
      },
    });
  }

  // Search campaigns by name or description within an organization
  static async search(query: string, orgId: string, userId?: string) {
    const scopedOrgId = requireOrgId(orgId);
    return await prisma.campaign.findMany({
      where: {
        AND: [
          { creator: { orgId: scopedOrgId } },
          userId ? { createdBy: userId } : {},
          {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { description: { contains: query, mode: 'insensitive' } },
            ],
          },
        ],
      },
      include: {
        creator: CREATOR_SELECT,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}

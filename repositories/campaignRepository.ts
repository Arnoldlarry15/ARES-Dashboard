// Campaign Repository - Database operations for Campaign model
import prisma from '../utils/db';
import type { Prisma } from '@prisma/client';

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

export class CampaignRepository {
  // Create a new campaign
  static async create(data: CreateCampaignInput) {
    return await prisma.campaign.create({
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
        creator: true,
      },
    });
  }

  // Find campaign by ID
  static async findById(id: string) {
    return await prisma.campaign.findUnique({
      where: { id },
      include: {
        creator: true,
      },
    });
  }

  // Get all campaigns by a user
  static async findByUserId(userId: string) {
    return await prisma.campaign.findMany({
      where: { createdBy: userId },
      include: {
        creator: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Get all campaigns (with pagination)
  static async findAll(options?: { skip?: number; take?: number }) {
    return await prisma.campaign.findMany({
      include: {
        creator: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: options?.skip,
      take: options?.take,
    });
  }

  // Update campaign
  static async update(id: string, data: UpdateCampaignInput) {
    const updateData: Prisma.CampaignUpdateInput = {};
    
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.framework !== undefined) updateData.framework = data.framework;
    if (data.tacticId !== undefined) updateData.tacticId = data.tacticId;
    if (data.tacticName !== undefined) updateData.tacticName = data.tacticName;
    if (data.selectedVectors !== undefined) updateData.selectedVectors = data.selectedVectors;
    if (data.selectedPayloadIndices !== undefined) updateData.selectedPayloadIndices = data.selectedPayloadIndices;
    if (data.metadata !== undefined) updateData.metadata = data.metadata;

    return await prisma.campaign.update({
      where: { id },
      data: updateData,
      include: {
        creator: true,
      },
    });
  }

  // Delete campaign
  static async delete(id: string) {
    return await prisma.campaign.delete({
      where: { id },
    });
  }

  // Count campaigns by user
  static async countByUserId(userId: string) {
    return await prisma.campaign.count({
      where: { createdBy: userId },
    });
  }

  // Search campaigns by name or description
  static async search(query: string, userId?: string) {
    return await prisma.campaign.findMany({
      where: {
        AND: [
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
        creator: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}

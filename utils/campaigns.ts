// Campaign Management - Database-backed with localStorage fallback

import { CampaignAPI } from './apiClient';
import { AuthService } from '../services/authService';

export interface Campaign {
  id: string;
  name: string;
  description?: string;
  tactic_id: string;
  tactic_name: string;
  framework: string;
  selected_vectors: string[];
  selected_payload_indices: number[];
  created_at: string;
  updated_at: string;
  createdBy?: string;
  creator?: {
    id: string;
    email: string;
    name?: string;
  };
}

// Database campaign format (camelCase)
interface DBCampaign {
  id: string;
  name: string;
  description?: string;
  tacticId: string;
  tacticName: string;
  framework: string;
  selectedVectors: string[];
  selectedPayloadIndices: number[];
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  creator?: {
    id: string;
    email: string;
    name?: string;
  };
}

const CAMPAIGNS_KEY = 'ares_campaigns';

// Convert DB format to app format
function dbToApp(dbCampaign: DBCampaign): Campaign {
  return {
    id: dbCampaign.id,
    name: dbCampaign.name,
    description: dbCampaign.description,
    tactic_id: dbCampaign.tacticId,
    tactic_name: dbCampaign.tacticName,
    framework: dbCampaign.framework,
    selected_vectors: dbCampaign.selectedVectors || [],
    selected_payload_indices: dbCampaign.selectedPayloadIndices || [],
    created_at: dbCampaign.createdAt,
    updated_at: dbCampaign.updatedAt,
    createdBy: dbCampaign.createdBy,
    creator: dbCampaign.creator,
  };
}

// Convert app format to DB format
function appToDb(campaign: Partial<Campaign>, createdBy: string): Partial<DBCampaign> {
  const dbCampaign: Partial<DBCampaign> = {};
  
  if (campaign.name) dbCampaign.name = campaign.name;
  if (campaign.description !== undefined) dbCampaign.description = campaign.description;
  if (campaign.tactic_id) dbCampaign.tacticId = campaign.tactic_id;
  if (campaign.tactic_name) dbCampaign.tacticName = campaign.tactic_name;
  if (campaign.framework) dbCampaign.framework = campaign.framework;
  if (campaign.selected_vectors) dbCampaign.selectedVectors = campaign.selected_vectors;
  if (campaign.selected_payload_indices) dbCampaign.selectedPayloadIndices = campaign.selected_payload_indices;
  
  dbCampaign.createdBy = createdBy;
  
  return dbCampaign;
}

export const CampaignManager = {
  // Get current user ID
  _getCurrentUserId(): string {
    const user = AuthService.getCurrentUser();
    return user?.id || 'anonymous';
  },

  // Check if database is available
  async _isDatabaseAvailable(): Promise<boolean> {
    try {
      await CampaignAPI.getAll();
      return true;
    } catch (error) {
      return false;
    }
  },

  // Get all saved campaigns
  async getAllCampaigns(): Promise<Campaign[]> {
    try {
      const dbAvailable = await this._isDatabaseAvailable();
      
      if (dbAvailable) {
        const userId = this._getCurrentUserId();
        const dbCampaigns = await CampaignAPI.findByUserId(userId) as unknown as DBCampaign[];
        return dbCampaigns.map(dbToApp);
      } else {
        // Fallback to localStorage
        const stored = localStorage.getItem(CAMPAIGNS_KEY);
        if (!stored) return [];
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load campaigns:', error);
      // Fallback to localStorage on error
      try {
        const stored = localStorage.getItem(CAMPAIGNS_KEY);
        return stored ? JSON.parse(stored) : [];
      } catch {
        return [];
      }
    }
  },

  // Save a new campaign
  async saveCampaign(campaign: Omit<Campaign, 'id' | 'created_at' | 'updated_at'>): Promise<Campaign> {
    try {
      const dbAvailable = await this._isDatabaseAvailable();
      const userId = this._getCurrentUserId();
      
      if (dbAvailable) {
        const dbInput = {
          name: campaign.name,
          description: campaign.description,
          framework: campaign.framework,
          tacticId: campaign.tactic_id,
          tacticName: campaign.tactic_name,
          createdBy: userId,
          selectedVectors: campaign.selected_vectors,
          selectedPayloadIndices: campaign.selected_payload_indices,
        };
        
        const dbCampaign = await CampaignAPI.create(dbInput) as unknown as DBCampaign;
        return dbToApp(dbCampaign);
      } else {
        // Fallback to localStorage
        const campaigns = await this.getAllCampaigns();
        const newCampaign: Campaign = {
          ...campaign,
          id: `campaign_${Date.now()}_${crypto.randomUUID()}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        
        campaigns.push(newCampaign);
        localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(campaigns));
        return newCampaign;
      }
    } catch (error) {
      console.error('Failed to save campaign:', error);
      throw error;
    }
  },

  // Update an existing campaign
  async updateCampaign(id: string, updates: Partial<Omit<Campaign, 'id' | 'created_at'>>): Promise<Campaign | null> {
    try {
      const dbAvailable = await this._isDatabaseAvailable();
      
      if (dbAvailable) {
        const userId = this._getCurrentUserId();
        const dbUpdates = appToDb(updates, userId);
        const dbCampaign = await CampaignAPI.update(id, dbUpdates as any) as unknown as DBCampaign;
        return dbToApp(dbCampaign);
      } else {
        // Fallback to localStorage
        const campaigns = await this.getAllCampaigns();
        const index = campaigns.findIndex(c => c.id === id);
        
        if (index === -1) return null;
        
        campaigns[index] = {
          ...campaigns[index],
          ...updates,
          updated_at: new Date().toISOString(),
        };
        
        localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(campaigns));
        return campaigns[index];
      }
    } catch (error) {
      console.error('Failed to update campaign:', error);
      return null;
    }
  },

  // Delete a campaign
  async deleteCampaign(id: string): Promise<boolean> {
    try {
      const dbAvailable = await this._isDatabaseAvailable();
      const userId = this._getCurrentUserId();
      
      if (dbAvailable) {
        await CampaignAPI.delete(id, userId);
        return true;
      } else {
        // Fallback to localStorage
        const campaigns = await this.getAllCampaigns();
        const filtered = campaigns.filter(c => c.id !== id);
        
        if (filtered.length === campaigns.length) return false;
        
        localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(filtered));
        return true;
      }
    } catch (error) {
      console.error('Failed to delete campaign:', error);
      return false;
    }
  },

  // Get a specific campaign by ID
  async getCampaign(id: string): Promise<Campaign | null> {
    try {
      const dbAvailable = await this._isDatabaseAvailable();
      
      if (dbAvailable) {
        const dbCampaign = await CampaignAPI.findById(id) as unknown as DBCampaign | null;
        return dbCampaign ? dbToApp(dbCampaign) : null;
      } else {
        // Fallback to localStorage
        const campaigns = await this.getAllCampaigns();
        return campaigns.find(c => c.id === id) || null;
      }
    } catch (error) {
      console.error('Failed to get campaign:', error);
      return null;
    }
  },

  // Export campaigns as JSON
  async exportCampaigns(): Promise<string> {
    const campaigns = await this.getAllCampaigns();
    return JSON.stringify(campaigns, null, 2);
  },

  // Import campaigns from JSON
  async importCampaigns(jsonData: string): Promise<number> {
    try {
      const imported = JSON.parse(jsonData) as Campaign[];
      const existing = await this.getAllCampaigns();
      
      // Merge, avoiding duplicates by ID
      const existingIds = new Set(existing.map(c => c.id));
      const newCampaigns = imported.filter(c => !existingIds.has(c.id));
      
      const dbAvailable = await this._isDatabaseAvailable();
      
      if (dbAvailable) {
        // Import to database
        for (const campaign of newCampaigns) {
          await this.saveCampaign(campaign);
        }
      } else {
        // Fallback to localStorage
        const merged = [...existing, ...newCampaigns];
        localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(merged));
      }
      
      return newCampaigns.length;
    } catch (error) {
      console.error('Failed to import campaigns:', error);
      throw error;
    }
  },
};

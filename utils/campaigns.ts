// Campaign Management for saving and loading attack scenarios

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
}

const CAMPAIGNS_KEY = 'ares_campaigns';

export const CampaignManager = {
  // Get all saved campaigns
  getAllCampaigns(): Campaign[] {
    try {
      const stored = localStorage.getItem(CAMPAIGNS_KEY);
      if (!stored) return [];
      return JSON.parse(stored);
    } catch (error) {
      console.error('Failed to load campaigns:', error);
      return [];
    }
  },

  // Save a new campaign
  saveCampaign(campaign: Omit<Campaign, 'id' | 'created_at' | 'updated_at'>): Campaign {
    try {
      const campaigns = this.getAllCampaigns();
      const newCampaign: Campaign = {
        ...campaign,
        id: `campaign_${Date.now()}_${crypto.randomUUID()}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      campaigns.push(newCampaign);
      localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(campaigns));
      return newCampaign;
    } catch (error) {
      console.error('Failed to save campaign:', error);
      throw error;
    }
  },

  // Update an existing campaign
  updateCampaign(id: string, updates: Partial<Omit<Campaign, 'id' | 'created_at'>>): Campaign | null {
    try {
      const campaigns = this.getAllCampaigns();
      const index = campaigns.findIndex(c => c.id === id);
      
      if (index === -1) return null;
      
      campaigns[index] = {
        ...campaigns[index],
        ...updates,
        updated_at: new Date().toISOString()
      };
      
      localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(campaigns));
      return campaigns[index];
    } catch (error) {
      console.error('Failed to update campaign:', error);
      return null;
    }
  },

  // Delete a campaign
  deleteCampaign(id: string): boolean {
    try {
      const campaigns = this.getAllCampaigns();
      const filtered = campaigns.filter(c => c.id !== id);
      
      if (filtered.length === campaigns.length) return false;
      
      localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(filtered));
      return true;
    } catch (error) {
      console.error('Failed to delete campaign:', error);
      return false;
    }
  },

  // Get a specific campaign by ID
  getCampaign(id: string): Campaign | null {
    try {
      const campaigns = this.getAllCampaigns();
      return campaigns.find(c => c.id === id) || null;
    } catch (error) {
      console.error('Failed to get campaign:', error);
      return null;
    }
  },

  // Export campaigns as JSON
  exportCampaigns(): string {
    const campaigns = this.getAllCampaigns();
    return JSON.stringify(campaigns, null, 2);
  },

  // Import campaigns from JSON
  importCampaigns(jsonData: string): number {
    try {
      const imported = JSON.parse(jsonData) as Campaign[];
      const existing = this.getAllCampaigns();
      
      // Merge, avoiding duplicates by ID
      const existingIds = new Set(existing.map(c => c.id));
      const newCampaigns = imported.filter(c => !existingIds.has(c.id));
      
      const merged = [...existing, ...newCampaigns];
      localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify(merged));
      
      return newCampaigns.length;
    } catch (error) {
      console.error('Failed to import campaigns:', error);
      throw error;
    }
  }
};

// Tests for API Client
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ApiError, UserAPI, CampaignAPI, AuditLogAPI } from '../../utils/apiClient';

// Mock fetch globally
global.fetch = vi.fn();

describe('ApiClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ApiError', () => {
    it('should create an ApiError with message, status, and data', () => {
      const error = new ApiError('Test error', 404, { detail: 'Not found' });
      expect(error.message).toBe('Test error');
      expect(error.status).toBe(404);
      expect(error.data).toEqual({ detail: 'Not found' });
      expect(error.name).toBe('ApiError');
    });
  });

  describe('UserAPI', () => {
    describe('findByEmail', () => {
      it('should fetch user by email', async () => {
        const mockUser = { id: '1', email: 'test@example.com', role: 'analyst', orgId: 'org1' };
        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ user: mockUser }),
        });

        const result = await UserAPI.findByEmail('test@example.com');
        
        expect(result).toEqual(mockUser);
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/users?email=test%40example.com',
          expect.objectContaining({
            headers: expect.objectContaining({
              'Content-Type': 'application/json',
            }),
          })
        );
      });

      it('should return null when user not found', async () => {
        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ user: null }),
        });

        const result = await UserAPI.findByEmail('nonexistent@example.com');
        expect(result).toBeNull();
      });
    });

    describe('findById', () => {
      it('should fetch user by id', async () => {
        const mockUser = { id: '123', email: 'test@example.com', role: 'admin', orgId: 'org1' };
        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ user: mockUser }),
        });

        const result = await UserAPI.findById('123');
        
        expect(result).toEqual(mockUser);
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/users?id=123',
          expect.any(Object)
        );
      });
    });

    describe('findByOrgId', () => {
      it('should fetch users by organization id', async () => {
        const mockUsers = [
          { id: '1', email: 'user1@example.com', role: 'analyst', orgId: 'org1' },
          { id: '2', email: 'user2@example.com', role: 'admin', orgId: 'org1' },
        ];
        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ users: mockUsers }),
        });

        const result = await UserAPI.findByOrgId('org1');
        
        expect(result).toEqual(mockUsers);
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/users?orgId=org1',
          expect.any(Object)
        );
      });
    });

    describe('create', () => {
      it('should create a new user', async () => {
        const newUser = { email: 'new@example.com', role: 'analyst', orgId: 'org1' };
        const createdUser = { id: '456', ...newUser, createdAt: '2024-01-01', updatedAt: '2024-01-01' };
        
        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ user: createdUser }),
        });

        const result = await UserAPI.create(newUser);
        
        expect(result).toEqual(createdUser);
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/users',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify(newUser),
          })
        );
      });
    });

    describe('update', () => {
      it('should update a user', async () => {
        const updates = { name: 'Updated Name', role: 'admin' };
        const updatedUser = { id: '123', email: 'test@example.com', ...updates };
        
        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ user: updatedUser }),
        });

        const result = await UserAPI.update('123', updates);
        
        expect(result).toEqual(updatedUser);
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/users',
          expect.objectContaining({
            method: 'PUT',
            body: JSON.stringify({ id: '123', ...updates }),
          })
        );
      });
    });

    describe('delete', () => {
      it('should delete a user', async () => {
        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ message: 'User deleted successfully' }),
        });

        await UserAPI.delete('123');
        
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/users?id=123',
          expect.objectContaining({
            method: 'DELETE',
          })
        );
      });
    });
  });

  describe('CampaignAPI', () => {
    describe('getAll', () => {
      it('should fetch all campaigns', async () => {
        const mockCampaigns = [
          { id: '1', name: 'Campaign 1', framework: 'OWASP' },
          { id: '2', name: 'Campaign 2', framework: 'MITRE' },
        ];
        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ campaigns: mockCampaigns }),
        });

        const result = await CampaignAPI.getAll();
        
        expect(result).toEqual(mockCampaigns);
        expect(global.fetch).toHaveBeenCalledWith('/api/campaigns', expect.any(Object));
      });
    });

    describe('findByUserId', () => {
      it('should fetch campaigns by user id', async () => {
        const mockCampaigns = [{ id: '1', name: 'Campaign 1', createdBy: 'user123' }];
        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ campaigns: mockCampaigns }),
        });

        const result = await CampaignAPI.findByUserId('user123');
        
        expect(result).toEqual(mockCampaigns);
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/campaigns?userId=user123',
          expect.any(Object)
        );
      });
    });

    describe('findById', () => {
      it('should fetch campaign by id', async () => {
        const mockCampaign = { id: '1', name: 'Campaign 1', framework: 'OWASP' };
        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ campaign: mockCampaign }),
        });

        const result = await CampaignAPI.findById('1');
        
        expect(result).toEqual(mockCampaign);
      });
    });

    describe('search', () => {
      it('should search campaigns', async () => {
        const mockCampaigns = [{ id: '1', name: 'Phishing Campaign' }];
        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ campaigns: mockCampaigns }),
        });

        const result = await CampaignAPI.search('phishing');
        
        expect(result).toEqual(mockCampaigns);
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/campaigns?search=phishing',
          expect.any(Object)
        );
      });

      it('should search campaigns with userId filter', async () => {
        const mockCampaigns = [{ id: '1', name: 'Phishing Campaign' }];
        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ campaigns: mockCampaigns }),
        });

        const result = await CampaignAPI.search('phishing', 'user123');
        
        expect(result).toEqual(mockCampaigns);
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/campaigns?search=phishing&userId=user123',
          expect.any(Object)
        );
      });
    });

    describe('create', () => {
      it('should create a new campaign', async () => {
        const newCampaign = {
          name: 'New Campaign',
          framework: 'OWASP',
          tacticId: 'LLM01',
          tacticName: 'Prompt Injection',
          createdBy: 'user123',
        };
        const createdCampaign = { id: '789', ...newCampaign };
        
        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ campaign: createdCampaign }),
        });

        const result = await CampaignAPI.create(newCampaign);
        
        expect(result).toEqual(createdCampaign);
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/campaigns',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify(newCampaign),
          })
        );
      });
    });

    describe('update', () => {
      it('should update a campaign', async () => {
        const updates = { name: 'Updated Campaign' };
        const updatedCampaign = { id: '1', name: 'Updated Campaign' };
        
        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ campaign: updatedCampaign }),
        });

        const result = await CampaignAPI.update('1', updates);
        
        expect(result).toEqual(updatedCampaign);
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/campaigns',
          expect.objectContaining({
            method: 'PUT',
            body: JSON.stringify({ id: '1', ...updates }),
          })
        );
      });
    });

    describe('delete', () => {
      it('should delete a campaign', async () => {
        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ message: 'Campaign deleted successfully' }),
        });

        await CampaignAPI.delete('1', 'user123');
        
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/campaigns?id=1&userId=user123',
          expect.objectContaining({
            method: 'DELETE',
          })
        );
      });
    });
  });

  describe('AuditLogAPI', () => {
    describe('getAll', () => {
      it('should fetch all audit logs', async () => {
        const mockLogs = [
          { id: '1', actorId: 'user1', action: 'login', target: 'session', timestamp: '2024-01-01' },
        ];
        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ auditLogs: mockLogs, count: 1 }),
        });

        const result = await AuditLogAPI.getAll();
        
        expect(result.auditLogs).toEqual(mockLogs);
        expect(result.count).toBe(1);
      });

      it('should fetch audit logs with filters', async () => {
        const mockLogs = [
          { id: '1', actorId: 'user1', action: 'login', target: 'session', timestamp: '2024-01-01' },
        ];
        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ auditLogs: mockLogs, count: 1 }),
        });

        const result = await AuditLogAPI.getAll({
          actorId: 'user1',
          action: 'login',
          startDate: '2024-01-01',
          endDate: '2024-12-31',
        });
        
        expect(result.auditLogs).toEqual(mockLogs);
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('actorId=user1'),
          expect.any(Object)
        );
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('action=login'),
          expect.any(Object)
        );
      });

      it('should fetch audit logs with pagination', async () => {
        const mockLogs = [
          { id: '1', actorId: 'user1', action: 'login', target: 'session', timestamp: '2024-01-01' },
        ];
        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ auditLogs: mockLogs, count: 100 }),
        });

        const result = await AuditLogAPI.getAll(undefined, { skip: 10, take: 20 });
        
        expect(result.auditLogs).toEqual(mockLogs);
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('skip=10'),
          expect.any(Object)
        );
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('take=20'),
          expect.any(Object)
        );
      });
    });

    describe('create', () => {
      it('should create an audit log entry', async () => {
        const newLog = {
          actorId: 'user1',
          action: 'campaign_created',
          target: 'campaign123',
          details: { name: 'Test Campaign' },
        };
        const createdLog = { id: '999', ...newLog, timestamp: '2024-01-01' };
        
        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => ({ auditLog: createdLog }),
        });

        const result = await AuditLogAPI.create(newLog);
        
        expect(result).toEqual(createdLog);
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/audit-logs',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify(newLog),
          })
        );
      });
    });
  });

  describe('Error Handling', () => {
    it('should throw ApiError on HTTP error response', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Not found' }),
      });

      try {
        await UserAPI.findById('nonexistent');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(ApiError);
        expect((error as ApiError).message).toBe('Not found');
        expect((error as ApiError).status).toBe(404);
      }
    });

    it('should throw ApiError with default message if no error in response', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({}),
      });

      await expect(UserAPI.findById('123')).rejects.toThrow('API request failed');
    });

    it('should throw ApiError on network error', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      await expect(UserAPI.findById('123')).rejects.toThrow(ApiError);
      await expect(UserAPI.findById('123')).rejects.toThrow('Network error or server unavailable');
    });
  });
});

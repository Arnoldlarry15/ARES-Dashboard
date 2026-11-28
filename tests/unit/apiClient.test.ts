// Tests for API Client
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ApiError, UserAPI, CampaignAPI, AuditLogAPI } from '../../utils/apiClient';

// Mock fetch globally
global.fetch = vi.fn();

describe('ApiClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Ensure no pending timers or promises
    vi.clearAllTimers();
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

    describe('createInvitation', () => {
      it('should create an organization invitation', async () => {
        const input = { invitedEmail: 'new@example.com', role: 'analyst' };
        const createdResponse = {
          invitation: {
            id: 'inv_456',
            orgId: 'org1',
            invitedEmail: 'new@example.com',
            role: 'analyst',
            createdBy: 'admin_1',
            expiresAt: '2026-01-02T00:00:00.000Z',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
          token: 'inv-token-123',
        };

        (global.fetch as any).mockResolvedValueOnce({
          ok: true,
          json: async () => createdResponse,
        });

        const result = await UserAPI.createInvitation(input);

        expect(result).toEqual(createdResponse);
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/users?resource=invitations',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify(input),
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

    it('should handle 204 No Content explicitly by returning undefined', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: async () => {
          throw new SyntaxError('Unexpected end of JSON input');
        },
      });

      const result = await CampaignAPI.delete('1', 'user123');
      expect(result).toBeUndefined();
    });

    it('should return parsed data on valid JSON 200', async () => {
      const mockCampaigns = [{ id: '1', name: 'Valid Campaign' }];
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ campaigns: mockCampaigns }),
      });

      const result = await CampaignAPI.getAll();
      expect(result).toEqual(mockCampaigns);
    });

    it('should throw ApiError on HTML 200 response instead of returning null', async () => {
      const parseError = new SyntaxError('Unexpected token < in JSON at position 0');
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => {
          throw parseError;
        },
      });

      await expect(CampaignAPI.getAll()).rejects.toMatchObject({
        name: 'ApiError',
        status: 200,
        message: 'Invalid JSON response from server',
        data: parseError,
      });
    });

    it('should throw ApiError on malformed JSON 200 response instead of returning null', async () => {
      const parseError = new SyntaxError('Unexpected end of JSON input');
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => {
          throw parseError;
        },
      });

      await expect(CampaignAPI.getAll()).rejects.toMatchObject({
        name: 'ApiError',
        status: 200,
        message: 'Invalid JSON response from server',
        data: parseError,
      });
    });

    it('should preserve status and payload on 500 JSON response', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: 'Database query failed' }),
      });

      await expect(CampaignAPI.getAll()).rejects.toMatchObject({
        name: 'ApiError',
        status: 500,
        message: 'Database query failed',
        data: { error: 'Database query failed' },
      });
    });

    it('should preserve status on 500 non-JSON response', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => {
          throw new SyntaxError('Unexpected token <');
        },
      });

      await expect(CampaignAPI.getAll()).rejects.toMatchObject({
        name: 'ApiError',
        status: 500,
        message: 'Internal Server Error',
        data: null,
      });
    });

    it('should throw ApiError with status 0 on actual fetch TypeError rejection', async () => {
      const networkError = new TypeError('Failed to fetch');
      (global.fetch as any).mockRejectedValueOnce(networkError);

      await expect(CampaignAPI.getAll()).rejects.toMatchObject({
        name: 'ApiError',
        status: 0,
        message: 'Network error or server unavailable',
        data: networkError,
      });
    });
  });
});

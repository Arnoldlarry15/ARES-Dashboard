import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CampaignManager, CampaignAuthError, Campaign } from '../../utils/campaigns';
import { ApiError, CampaignAPI } from '../../utils/apiClient';
import { AuthService } from '../../services/authService';

const CAMPAIGNS_KEY = 'ares_campaigns';

const sampleLocalCampaign: Campaign = {
  id: 'local_camp_1',
  name: 'Local Fallback Campaign',
  description: 'Stored in localStorage',
  tactic_id: 'LLM01',
  tactic_name: 'Prompt Injection',
  framework: 'OWASP LLM Top 10',
  selected_vectors: ['direct'],
  selected_payload_indices: [0, 1],
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const sampleCampaignInput = {
  name: 'New Campaign',
  description: 'Test campaign',
  tactic_id: 'LLM01',
  tactic_name: 'Prompt Injection',
  framework: 'OWASP LLM Top 10',
  selected_vectors: ['direct'],
  selected_payload_indices: [0],
};

describe('CampaignManager authentication & fallback handling', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    vi.spyOn(AuthService, 'getCurrentUser').mockReturnValue({
      id: 'user_123',
      email: 'analyst@ares.test',
      role: 'analyst',
    } as ReturnType<typeof AuthService.getCurrentUser>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('_isDatabaseAvailable', () => {
    it('returns true when CampaignAPI.getAll succeeds', async () => {
      vi.spyOn(CampaignAPI, 'getAll').mockResolvedValueOnce([]);
      await expect(CampaignManager._isDatabaseAvailable()).resolves.toBe(true);
    });

    it('throws CampaignAuthError (401) on authentication failure instead of returning false', async () => {
      vi.spyOn(CampaignAPI, 'getAll').mockRejectedValueOnce(
        new ApiError('Authentication required', 401)
      );

      await expect(CampaignManager._isDatabaseAvailable()).rejects.toMatchObject({
        name: 'CampaignAuthError',
        status: 401,
        code: 'AUTHENTICATION_REQUIRED',
      });
    });

    it('throws CampaignAuthError (403) on authorization failure instead of returning false', async () => {
      vi.spyOn(CampaignAPI, 'getAll').mockRejectedValueOnce(
        new ApiError('Forbidden', 403)
      );

      await expect(CampaignManager._isDatabaseAvailable()).rejects.toMatchObject({
        name: 'CampaignAuthError',
        status: 403,
        code: 'AUTHORIZATION_DENIED',
      });
    });

    it('returns false with DB-unavailable warning on 503', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(CampaignAPI, 'getAll').mockRejectedValueOnce(
        new ApiError('Database unreachable', 503)
      );

      await expect(CampaignManager._isDatabaseAvailable()).resolves.toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('503'),
        expect.any(ApiError)
      );
    });

    it('returns false with network-unavailable warning on status 0 or AbortError, but rethrows raw TypeError', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(CampaignAPI, 'getAll').mockRejectedValueOnce(
        new ApiError('Network error or server unavailable', 0)
      );

      await expect(CampaignManager._isDatabaseAvailable()).resolves.toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('network'),
        expect.any(ApiError)
      );

      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';
      vi.spyOn(CampaignAPI, 'getAll').mockRejectedValueOnce(abortErr);
      await expect(CampaignManager._isDatabaseAvailable()).resolves.toBe(false);

      vi.spyOn(CampaignAPI, 'getAll').mockRejectedValueOnce(
        new TypeError("Cannot destructure property 'campaigns' of 'undefined'")
      );
      await expect(CampaignManager._isDatabaseAvailable()).rejects.toBeInstanceOf(TypeError);
    });

    it('rethrows unexpected 500 errors rather than masking them', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(CampaignAPI, 'getAll').mockRejectedValueOnce(
        new ApiError('Internal server error', 500)
      );

      await expect(CampaignManager._isDatabaseAvailable()).rejects.toThrow(
        'Internal server error'
      );
    });
  });

  describe('getAllCampaigns', () => {
    beforeEach(() => {
      localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify([sampleLocalCampaign]));
    });

    it('does not fall back to localStorage on 401 from availability check', async () => {
      vi.spyOn(CampaignAPI, 'getAll').mockRejectedValueOnce(
        new ApiError('Unauthorized', 401)
      );

      await expect(CampaignManager.getAllCampaigns()).rejects.toBeInstanceOf(
        CampaignAuthError
      );
    });

    it('does not fall back to localStorage on 403 from findByUserId', async () => {
      vi.spyOn(CampaignAPI, 'getAll').mockResolvedValueOnce([]);
      vi.spyOn(CampaignAPI, 'findByUserId').mockRejectedValueOnce(
        new ApiError('Forbidden', 403)
      );

      await expect(CampaignManager.getAllCampaigns()).rejects.toMatchObject({
        status: 403,
        code: 'AUTHORIZATION_DENIED',
      });
    });

    it('falls back to localStorage on 503 DB unavailability', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(CampaignAPI, 'getAll').mockRejectedValueOnce(
        new ApiError('Service unavailable', 503)
      );

      const campaigns = await CampaignManager.getAllCampaigns();
      expect(campaigns).toEqual([sampleLocalCampaign]);
    });

    it('does not fall back to localStorage on raw TypeError', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(CampaignAPI, 'getAll').mockRejectedValueOnce(
        new TypeError("Cannot destructure property 'campaigns' of 'undefined'")
      );

      await expect(CampaignManager.getAllCampaigns()).rejects.toBeInstanceOf(TypeError);
    });

    it('falls back to localStorage on actual network rejection (status 0)', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch'));

      const campaigns = await CampaignManager.getAllCampaigns();
      expect(campaigns).toEqual([sampleLocalCampaign]);
    });
  });

  describe('saveCampaign', () => {
    it('throws CampaignAuthError (401) and does not write to localStorage', async () => {
      vi.spyOn(CampaignAPI, 'getAll').mockResolvedValueOnce([]);
      vi.spyOn(CampaignAPI, 'create').mockRejectedValueOnce(
        new ApiError('Unauthorized', 401)
      );

      await expect(CampaignManager.saveCampaign(sampleCampaignInput)).rejects.toMatchObject({
        status: 401,
        code: 'AUTHENTICATION_REQUIRED',
      });
      expect(localStorage.getItem(CAMPAIGNS_KEY)).toBeNull();
    });

    it('throws CampaignAuthError (403) and does not write to localStorage', async () => {
      vi.spyOn(CampaignAPI, 'getAll').mockRejectedValueOnce(
        new ApiError('Insufficient role', 403)
      );

      await expect(CampaignManager.saveCampaign(sampleCampaignInput)).rejects.toMatchObject({
        status: 403,
        code: 'AUTHORIZATION_DENIED',
      });
      expect(localStorage.getItem(CAMPAIGNS_KEY)).toBeNull();
    });

    it('falls back to localStorage when DB is unavailable (503)', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(CampaignAPI, 'getAll').mockRejectedValueOnce(
        new ApiError('Database unavailable', 503)
      );

      const saved = await CampaignManager.saveCampaign(sampleCampaignInput);
      expect(saved.name).toBe(sampleCampaignInput.name);
      const stored = JSON.parse(localStorage.getItem(CAMPAIGNS_KEY) || '[]');
      expect(stored).toHaveLength(1);
    });
  });

  describe('updateCampaign', () => {
    beforeEach(() => {
      localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify([sampleLocalCampaign]));
    });

    it('throws CampaignAuthError (401) instead of returning null or updating localStorage', async () => {
      vi.spyOn(CampaignAPI, 'getAll').mockResolvedValueOnce([]);
      vi.spyOn(CampaignAPI, 'update').mockRejectedValueOnce(
        new ApiError('Unauthorized', 401)
      );

      await expect(
        CampaignManager.updateCampaign(sampleLocalCampaign.id, { name: 'Hacked' })
      ).rejects.toMatchObject({
        status: 401,
        code: 'AUTHENTICATION_REQUIRED',
      });

      const stored = JSON.parse(localStorage.getItem(CAMPAIGNS_KEY) || '[]');
      expect(stored[0].name).toBe('Local Fallback Campaign');
    });

    it('throws CampaignAuthError (403) instead of returning null or updating localStorage', async () => {
      vi.spyOn(CampaignAPI, 'getAll').mockRejectedValueOnce(
        new ApiError('Forbidden', 403)
      );

      await expect(
        CampaignManager.updateCampaign(sampleLocalCampaign.id, { name: 'Hacked' })
      ).rejects.toMatchObject({
        status: 403,
        code: 'AUTHORIZATION_DENIED',
      });
    });

    it('falls back to localStorage on network unavailability', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(CampaignAPI, 'getAll').mockRejectedValueOnce(
        new ApiError('Network error', 0)
      );

      const updated = await CampaignManager.updateCampaign(sampleLocalCampaign.id, {
        name: 'Updated Offline',
      });
      expect(updated?.name).toBe('Updated Offline');
    });

    it('rethrows HTTP 500 errors instead of returning null or updating localStorage', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(CampaignAPI, 'getAll').mockResolvedValueOnce([]);
      vi.spyOn(CampaignAPI, 'update').mockRejectedValueOnce(
        new ApiError('Internal server error', 500)
      );

      await expect(
        CampaignManager.updateCampaign(sampleLocalCampaign.id, { name: 'Server Fail' })
      ).rejects.toMatchObject({
        status: 500,
        message: 'Internal server error',
      });

      const stored = JSON.parse(localStorage.getItem(CAMPAIGNS_KEY) || '[]');
      expect(stored[0].name).toBe('Local Fallback Campaign');
    });
  });

  describe('deleteCampaign', () => {
    beforeEach(() => {
      localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify([sampleLocalCampaign]));
    });

    it('throws CampaignAuthError (401) instead of returning false or deleting localStorage', async () => {
      vi.spyOn(CampaignAPI, 'getAll').mockResolvedValueOnce([]);
      vi.spyOn(CampaignAPI, 'delete').mockRejectedValueOnce(
        new ApiError('Unauthorized', 401)
      );

      await expect(
        CampaignManager.deleteCampaign(sampleLocalCampaign.id)
      ).rejects.toMatchObject({
        status: 401,
        code: 'AUTHENTICATION_REQUIRED',
      });

      const stored = JSON.parse(localStorage.getItem(CAMPAIGNS_KEY) || '[]');
      expect(stored).toHaveLength(1);
    });

    it('throws CampaignAuthError (403) instead of returning false', async () => {
      vi.spyOn(CampaignAPI, 'getAll').mockRejectedValueOnce(
        new ApiError('Forbidden', 403)
      );

      await expect(
        CampaignManager.deleteCampaign(sampleLocalCampaign.id)
      ).rejects.toMatchObject({
        status: 403,
        code: 'AUTHORIZATION_DENIED',
      });
    });

    it('falls back to localStorage on 503 DB unavailability', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(CampaignAPI, 'getAll').mockRejectedValueOnce(
        new ApiError('DB down', 503)
      );

      const deleted = await CampaignManager.deleteCampaign(sampleLocalCampaign.id);
      expect(deleted).toBe(true);
      expect(JSON.parse(localStorage.getItem(CAMPAIGNS_KEY) || '[]')).toHaveLength(0);
    });

    it('rethrows HTTP 500 errors instead of returning false or deleting localStorage', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(CampaignAPI, 'getAll').mockResolvedValueOnce([]);
      vi.spyOn(CampaignAPI, 'delete').mockRejectedValueOnce(
        new ApiError('Internal server error', 500)
      );

      await expect(
        CampaignManager.deleteCampaign(sampleLocalCampaign.id)
      ).rejects.toMatchObject({
        status: 500,
        message: 'Internal server error',
      });

      const stored = JSON.parse(localStorage.getItem(CAMPAIGNS_KEY) || '[]');
      expect(stored).toHaveLength(1);
    });
  });

  describe('getCampaign, exportCampaigns, and importCampaigns', () => {
    beforeEach(() => {
      localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify([sampleLocalCampaign]));
    });

    it('getCampaign propagates 401/403 without falling back to localStorage', async () => {
      vi.spyOn(CampaignAPI, 'getAll').mockResolvedValueOnce([]);
      vi.spyOn(CampaignAPI, 'findById').mockRejectedValueOnce(
        new ApiError('Forbidden', 403)
      );

      await expect(
        CampaignManager.getCampaign(sampleLocalCampaign.id)
      ).rejects.toMatchObject({
        status: 403,
        code: 'AUTHORIZATION_DENIED',
      });
    });

    it('exportCampaigns propagates 401 without exporting localStorage', async () => {
      vi.spyOn(CampaignAPI, 'getAll').mockRejectedValueOnce(
        new ApiError('Unauthorized', 401)
      );

      await expect(CampaignManager.exportCampaigns()).rejects.toMatchObject({
        status: 401,
        code: 'AUTHENTICATION_REQUIRED',
      });
    });

    it('importCampaigns propagates 403 without writing to localStorage', async () => {
      vi.spyOn(CampaignAPI, 'getAll').mockRejectedValueOnce(
        new ApiError('Forbidden', 403)
      );

      await expect(
        CampaignManager.importCampaigns(JSON.stringify([]))
      ).rejects.toMatchObject({
        status: 403,
        code: 'AUTHORIZATION_DENIED',
      });
    });

    it('getCampaign rethrows HTTP 500 errors instead of returning null', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(CampaignAPI, 'getAll').mockResolvedValueOnce([]);
      vi.spyOn(CampaignAPI, 'findById').mockRejectedValueOnce(
        new ApiError('Internal server error', 500)
      );

      await expect(
        CampaignManager.getCampaign(sampleLocalCampaign.id)
      ).rejects.toMatchObject({
        status: 500,
        message: 'Internal server error',
      });
    });

    it('getCampaign returns null on HTTP 404', async () => {
      vi.spyOn(CampaignAPI, 'getAll').mockResolvedValueOnce([]);
      vi.spyOn(CampaignAPI, 'findById').mockRejectedValueOnce(
        new ApiError('Campaign not found', 404)
      );

      await expect(
        CampaignManager.getCampaign(sampleLocalCampaign.id)
      ).resolves.toBeNull();
    });
  });

  describe('CampaignAuthError code preservation & fetchApi non-JSON errors', () => {
    it('CampaignAuthError preserves ONBOARDING_REQUIRED code on 403', async () => {
      const err = new CampaignAuthError('Organization onboarding required', 403, {
        code: 'ONBOARDING_REQUIRED',
      });
      expect(err.status).toBe(403);
      expect(err.code).toBe('ONBOARDING_REQUIRED');

      vi.spyOn(CampaignAPI, 'getAll').mockRejectedValueOnce(
        new ApiError('Organization onboarding required', 403, {
          code: 'ONBOARDING_REQUIRED',
        })
      );

      await expect(CampaignManager.getAllCampaigns()).rejects.toMatchObject({
        name: 'CampaignAuthError',
        status: 403,
        code: 'ONBOARDING_REQUIRED',
      });
    });

    it('fetchApi preserves HTTP 502/500 status on non-JSON responses instead of status 0', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON');
        },
      } as unknown as Response);

      await expect(CampaignAPI.getAll()).rejects.toMatchObject({
        name: 'ApiError',
        status: 502,
        message: 'Bad Gateway',
      });

      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => {
          throw new SyntaxError('Unexpected token I in JSON');
        },
      } as unknown as Response);

      await expect(CampaignAPI.getAll()).rejects.toMatchObject({
        name: 'ApiError',
        status: 500,
        message: 'Internal Server Error',
      });

      fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(CampaignAPI.getAll()).rejects.toMatchObject({
        name: 'ApiError',
        status: 0,
      });
    });
  });

  describe('CampaignManager D-1 response parsing & fallback matrix', () => {
    beforeEach(() => {
      localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify([sampleLocalCampaign]));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    it('throws and does not fall back to localStorage on HTML 200', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON');
        },
      } as unknown as Response);

      await expect(CampaignManager.getAllCampaigns()).rejects.toMatchObject({
        name: 'ApiError',
        status: 200,
        message: 'Invalid JSON response from server',
      });
    });

    it('throws and does not fall back to localStorage on malformed JSON 200', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError('Unexpected end of JSON input');
        },
      } as unknown as Response);

      await expect(CampaignManager.getAllCampaigns()).rejects.toMatchObject({
        name: 'ApiError',
        status: 200,
        message: 'Invalid JSON response from server',
      });
    });

    it('throws and does not fall back to localStorage on 204 No Content from /api/campaigns', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: async () => {
          throw new SyntaxError('Unexpected end of JSON input');
        },
      } as unknown as Response);

      await expect(CampaignManager.getAllCampaigns()).rejects.toBeInstanceOf(TypeError);
    });

    it('throws and does not fall back to localStorage on 500 JSON or 500 non-JSON', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: 'DB exploded' }),
      } as unknown as Response);

      await expect(CampaignManager.getAllCampaigns()).rejects.toMatchObject({
        name: 'ApiError',
        status: 500,
        message: 'DB exploded',
      });

      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => {
          throw new SyntaxError('Unexpected token <');
        },
      } as unknown as Response);

      await expect(CampaignManager.getAllCampaigns()).rejects.toMatchObject({
        name: 'ApiError',
        status: 500,
        message: 'Internal Server Error',
      });
    });

    it('throws CampaignAuthError and does not fall back to localStorage on 401 or 403', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error: 'Unauthorized' }),
      } as unknown as Response);

      await expect(CampaignManager.getAllCampaigns()).rejects.toMatchObject({
        name: 'CampaignAuthError',
        status: 401,
      });

      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({ error: 'Forbidden' }),
      } as unknown as Response);

      await expect(CampaignManager.getAllCampaigns()).rejects.toMatchObject({
        name: 'CampaignAuthError',
        status: 403,
      });
    });

    it('falls back to localStorage on 503 and actual network rejection', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      fetchSpy.mockResolvedValueOnce({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        json: async () => ({ error: 'Database unavailable' }),
      } as unknown as Response);

      await expect(CampaignManager.getAllCampaigns()).resolves.toEqual([sampleLocalCampaign]);

      fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(CampaignManager.getAllCampaigns()).resolves.toEqual([sampleLocalCampaign]);
    });
  });
});

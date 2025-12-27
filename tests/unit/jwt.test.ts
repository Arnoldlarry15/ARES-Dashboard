import { describe, it, expect } from 'vitest';
import { 
  generateTokens, 
  verifyAccessToken, 
  verifyRefreshToken,
  extractTokenFromHeader 
} from '../../services/auth/jwt';

describe('JWT Utilities', () => {
  describe('generateTokens', () => {
    it('should generate access and refresh tokens', () => {
      const payload = {
        userId: 'user123',
        email: 'test@example.com',
        role: 'analyst',
        organizationId: 'org123'
      };

      const tokens = generateTokens(payload);

      expect(tokens).toHaveProperty('accessToken');
      expect(tokens).toHaveProperty('refreshToken');
      expect(typeof tokens.accessToken).toBe('string');
      expect(typeof tokens.refreshToken).toBe('string');
    });

    it('should include all payload fields in token', () => {
      const payload = {
        userId: 'user456',
        email: 'admin@example.com',
        role: 'admin',
        organizationId: 'org456',
        permissions: ['campaign:read', 'campaign:write']
      };

      const tokens = generateTokens(payload);
      const decoded = verifyAccessToken(tokens.accessToken);

      expect(decoded).toMatchObject({
        userId: payload.userId,
        email: payload.email,
        role: payload.role,
        organizationId: payload.organizationId,
        permissions: payload.permissions
      });
    });

    it('should set expiration time for access token', () => {
      const payload = {
        userId: 'user123',
        email: 'test@example.com',
        role: 'analyst'
      };

      const tokens = generateTokens(payload);
      const decoded = verifyAccessToken(tokens.accessToken);

      expect(decoded).toHaveProperty('exp');
      expect(decoded!.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });
  });

  describe('verifyAccessToken', () => {
    it('should successfully verify valid token', () => {
      const payload = {
        userId: 'user123',
        email: 'test@example.com',
        role: 'analyst',
        organizationId: 'org123'
      };

      const tokens = generateTokens(payload);
      const decoded = verifyAccessToken(tokens.accessToken);

      expect(decoded).not.toBeNull();
      expect(decoded?.userId).toBe(payload.userId);
      expect(decoded?.email).toBe(payload.email);
      expect(decoded?.role).toBe(payload.role);
    });

    it('should return null for expired token', () => {
      // Create an expired token
      const expiredToken = Buffer.from(JSON.stringify({
        userId: 'user123',
        email: 'test@example.com',
        role: 'analyst',
        exp: Math.floor(Date.now() / 1000) - 3600 // Expired 1 hour ago
      })).toString('base64');

      const decoded = verifyAccessToken(expiredToken);

      expect(decoded).toBeNull();
    });

    it('should return null for invalid token format', () => {
      const decoded = verifyAccessToken('invalid-token');

      expect(decoded).toBeNull();
    });

    it('should return null for malformed token', () => {
      const decoded = verifyAccessToken('not.a.valid.jwt');

      expect(decoded).toBeNull();
    });
  });

  describe('verifyRefreshToken', () => {
    it('should successfully verify valid refresh token', () => {
      const payload = {
        userId: 'user123',
        email: 'test@example.com',
        role: 'analyst',
        organizationId: 'org123'
      };

      const tokens = generateTokens(payload);
      const decoded = verifyRefreshToken(tokens.refreshToken);

      expect(decoded).not.toBeNull();
      expect(decoded?.userId).toBe(payload.userId);
    });

    it('should return null for expired refresh token', () => {
      const expiredToken = Buffer.from(JSON.stringify({
        userId: 'user123',
        email: 'test@example.com',
        role: 'analyst',
        type: 'refresh',
        exp: Math.floor(Date.now() / 1000) - 3600
      })).toString('base64');

      const decoded = verifyRefreshToken(expiredToken);

      expect(decoded).toBeNull();
    });

    it('should return null for access token passed as refresh token', () => {
      const payload = {
        userId: 'user123',
        email: 'test@example.com',
        role: 'analyst'
      };

      const tokens = generateTokens(payload);
      const decoded = verifyRefreshToken(tokens.accessToken);

      expect(decoded).toBeNull();
    });

    it('should handle invalid refresh token', () => {
      const decoded = verifyRefreshToken('invalid-refresh-token');

      expect(decoded).toBeNull();
    });
  });

  describe('extractTokenFromHeader', () => {
    it('should extract token from valid Bearer header', () => {
      const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test';
      const header = `Bearer ${token}`;

      const extracted = extractTokenFromHeader(header);

      expect(extracted).toBe(token);
    });

    it('should return null for missing header', () => {
      const extracted = extractTokenFromHeader(undefined);

      expect(extracted).toBeNull();
    });

    it('should return null for header without Bearer prefix', () => {
      const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test';
      const extracted = extractTokenFromHeader(token);

      expect(extracted).toBeNull();
    });

    it('should return null for malformed Bearer header', () => {
      const extracted = extractTokenFromHeader('Bearer');

      expect(extracted).toBeNull();
    });

    it('should return null for wrong authorization scheme', () => {
      const extracted = extractTokenFromHeader('Basic dXNlcjpwYXNz');

      expect(extracted).toBeNull();
    });
  });

  describe('Token Integration', () => {
    it('should complete full token lifecycle', () => {
      // Generate tokens
      const payload = {
        userId: 'user123',
        email: 'test@example.com',
        role: 'red_team_lead',
        organizationId: 'org123',
        permissions: ['campaign:read', 'campaign:write', 'team:manage']
      };

      const tokens = generateTokens(payload);

      // Verify access token
      const accessDecoded = verifyAccessToken(tokens.accessToken);
      expect(accessDecoded).not.toBeNull();
      expect(accessDecoded?.userId).toBe(payload.userId);

      // Verify refresh token
      const refreshDecoded = verifyRefreshToken(tokens.refreshToken);
      expect(refreshDecoded).not.toBeNull();
      expect(refreshDecoded?.userId).toBe(payload.userId);

      // Extract from header
      const extracted = extractTokenFromHeader(`Bearer ${tokens.accessToken}`);
      expect(extracted).toBe(tokens.accessToken);

      // Verify extracted token
      const finalDecoded = verifyAccessToken(extracted!);
      expect(finalDecoded).not.toBeNull();
      expect(finalDecoded).toMatchObject({
        userId: payload.userId,
        email: payload.email,
        role: payload.role
      });
    });

    it('should handle token refresh scenario', () => {
      // Initial tokens
      const payload = {
        userId: 'user123',
        email: 'test@example.com',
        role: 'analyst'
      };

      const initialTokens = generateTokens(payload);

      // Simulate refresh: verify refresh token and generate new access token
      const refreshDecoded = verifyRefreshToken(initialTokens.refreshToken);
      expect(refreshDecoded).not.toBeNull();

      // Generate new tokens
      const newTokens = generateTokens({
        userId: refreshDecoded!.userId,
        email: refreshDecoded!.email,
        role: refreshDecoded!.role
      });

      // Verify new access token
      const newAccessDecoded = verifyAccessToken(newTokens.accessToken);
      expect(newAccessDecoded).not.toBeNull();
      expect(newAccessDecoded?.userId).toBe(payload.userId);
    });
  });
});

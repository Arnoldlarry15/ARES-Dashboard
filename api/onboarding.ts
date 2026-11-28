// API endpoint for first-time Auth0 user onboarding (create organization or accept invitation)
import crypto from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  createCsrfToken,
  extractTokenFromHeader,
  generateTokens,
  isProductionEnvironment,
  verifyAuth0AccessToken,
  verifyCsrfToken,
  verifyOnboardingToken
} from '../services/auth/jwt';
import { UserRepository } from '../repositories/userRepository';
import { compose, getClientIp, requestLogger, securityHeaders } from '../lib/middleware/security';
import { rateLimit } from '../lib/middleware/rateLimit';
import { logger } from '../lib/logger';

const ONE_HOUR = 3600;

interface OnboardingIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  authMethod: 'bearer' | 'cookie';
  jti?: string;
}

function extractOnboardingCookie(cookieHeader?: string): string | null {
  if (!cookieHeader) {
    return null;
  }
  const hostMatch = cookieHeader.match(/(?:^|;\s*)__Host-onboarding_token=([^;]+)/);
  if (hostMatch?.[1]) {
    return hostMatch[1];
  }
  const match = cookieHeader.match(/(?:^|;\s*)onboarding_token=([^;]+)/);
  return match?.[1] || null;
}

function extractCsrfCookie(cookieHeader?: string): string {
  if (!cookieHeader) {
    return '';
  }
  const match =
    cookieHeader.match(/(?:^|;\s*)__Host-csrf_token=([^;]+)/) ||
    cookieHeader.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match?.[1] || '';
}

function getAllowedOnboardingOrigins(req: VercelRequest): Set<string> {
  const allowed = new Set<string>();
  const envOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  for (const origin of envOrigins) {
    try {
      allowed.add(new URL(origin).origin);
    } catch {
      // Ignore malformed configured origin
    }
  }

  if (process.env.APP_URL) {
    try {
      allowed.add(new URL(process.env.APP_URL.trim()).origin);
    } catch {
      // Ignore malformed APP_URL
    }
  }

  const rawHost =
    (process.env.TRUST_PROXY === 'true'
      ? (Array.isArray(req.headers['x-forwarded-host'])
          ? req.headers['x-forwarded-host'][0]
          : req.headers['x-forwarded-host'])
      : undefined) ||
    (Array.isArray(req.headers.host) ? req.headers.host[0] : req.headers.host);
  const host = typeof rawHost === 'string' ? rawHost.split(',')[0].trim() : '';
  if (host) {
    allowed.add(`https://${host}`);
    if (!isProductionEnvironment()) {
      allowed.add(`http://${host}`);
    }
  }

  return allowed;
}

function isSameOriginOnboardingRequest(req: VercelRequest): boolean {
  const rawSecFetchSite = req.headers['sec-fetch-site'];
  const secFetchSite = (Array.isArray(rawSecFetchSite) ? rawSecFetchSite[0] : rawSecFetchSite)
    ?.toLowerCase()
    .trim();
  if (secFetchSite && secFetchSite !== 'same-origin') {
    return false;
  }

  const rawOrigin = req.headers.origin;
  const originHeader = Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin;
  if (typeof originHeader === 'string' && originHeader.trim()) {
    try {
      const parsedOrigin = new URL(originHeader.trim()).origin;
      return getAllowedOnboardingOrigins(req).has(parsedOrigin);
    } catch {
      return false;
    }
  }

  return true;
}

async function authenticateOnboarding(req: VercelRequest): Promise<OnboardingIdentity | null> {
  const authHeader = req.headers.authorization as string | undefined;

  if (authHeader !== undefined) {
    const bearerToken = extractTokenFromHeader(authHeader);
    if (!bearerToken) {
      return null;
    }
    const auth0Identity = await verifyAuth0AccessToken(bearerToken);
    if (!auth0Identity || !auth0Identity.email || !auth0Identity.emailVerified) {
      return null;
    }
    return {
      sub: auth0Identity.sub,
      email: auth0Identity.email,
      emailVerified: true,
      name: auth0Identity.name,
      authMethod: 'bearer',
    };
  }

  const cookieToken = extractOnboardingCookie(req.headers.cookie as string | undefined);
  if (!cookieToken) {
    return null;
  }
  const decoded = verifyOnboardingToken(cookieToken) as
    | (ReturnType<typeof verifyOnboardingToken> & { jti?: string })
    | null;
  if (!decoded) {
    return null;
  }
  const jti = decoded.jti || crypto.createHash('sha256').update(cookieToken).digest('hex');
  return {
    sub: decoded.sub,
    email: decoded.email,
    emailVerified: true,
    name: decoded.name,
    authMethod: 'cookie',
    jti,
  };
}

function setSessionAndClearOnboardingCookies(
  res: VercelResponse,
  user: { id: string; email: string; role: string; orgId: string }
) {
  const tokens = generateTokens({
    userId: user.id,
    email: user.email,
    role: user.role,
    organizationId: user.orgId,
    authProvider: 'auth0',
  });
  const csrfToken = createCsrfToken(tokens.jti);
  const isProd = isProductionEnvironment();
  const accessCookieName = isProd ? '__Host-access_token' : 'access_token';
  const csrfCookieName = isProd ? '__Host-csrf_token' : 'csrf_token';
  const secureFlag = isProd ? '; Secure' : '';
  const accessTokenExpiry = new Date(Date.now() + ONE_HOUR * 1000).toUTCString();

  res.setHeader('Set-Cookie', [
    `${accessCookieName}=${tokens.accessToken}; HttpOnly${secureFlag}; SameSite=Lax; Path=/; Max-Age=${ONE_HOUR}; Expires=${accessTokenExpiry}`,
    `${csrfCookieName}=${csrfToken}${secureFlag}; SameSite=Lax; Path=/; Max-Age=${ONE_HOUR}; Expires=${accessTokenExpiry}`,
    `onboarding_token=; HttpOnly${secureFlag}; SameSite=Lax; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
    `__Host-onboarding_token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
  ]);
}

const onboardingRateLimit = rateLimit({
  windowMs: 60_000,
  maxRequests: 20,
  keyPrefix: 'onboarding',
  message: 'Too many onboarding requests, please try again later.',
});

const handler = async (req: VercelRequest, res: VercelResponse) => {
  try {
    const identity = await authenticateOnboarding(req);
    if (!identity) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Valid onboarding session or Auth0 Bearer token required',
      });
    }

    if (req.method === 'GET') {
      const existingUser = await UserRepository.findByAuth0Sub(identity.sub);
      if (existingUser) {
        if (existingUser.disabledAt) {
          return res.status(403).json({
            error: 'Forbidden',
            code: 'USER_DEACTIVATED',
            message: 'Account has been deactivated',
          });
        }
        if (existingUser.orgId === 'default_org') {
          return res.status(403).json({
            error: 'Forbidden',
            code: 'LEGACY_ORG_MIGRATION_REQUIRED',
            message: 'Legacy default_org membership must be migrated',
          });
        }
        return res.status(200).json({
          status: 'provisioned',
          email: existingUser.email,
          name: existingUser.name,
          user: {
            id: existingUser.id,
            email: existingUser.email,
            name: existingUser.name,
            role: existingUser.role,
            organizationId: existingUser.orgId,
          },
        });
      }

      return res.status(200).json({
        status: 'onboarding_required',
        email: identity.email,
        name: identity.name,
      });
    }

    if (req.method === 'POST') {
      const rawContentType = req.headers['content-type'];
      const contentTypeStr = Array.isArray(rawContentType) ? rawContentType[0] : rawContentType;
      const mediaType =
        typeof contentTypeStr === 'string' ? contentTypeStr.toLowerCase().split(';')[0].trim() : '';
      if (mediaType !== 'application/json') {
        return res.status(415).json({
          error: 'Unsupported Media Type',
          message: 'Content-Type must be application/json',
        });
      }

      if (identity.authMethod === 'cookie') {
        if (!isSameOriginOnboardingRequest(req)) {
          logger.warn('Onboarding origin validation failed', {
            origin: req.headers.origin,
            secFetchSite: req.headers['sec-fetch-site'],
          });
          return res.status(403).json({
            error: 'Forbidden',
            message: 'Cross-origin onboarding requests are not allowed',
          });
        }

        const csrfCookie = extractCsrfCookie(req.headers.cookie as string | undefined);
        const rawCsrfHeader = req.headers['x-csrf-token'];
        const csrfHeader = (Array.isArray(rawCsrfHeader) ? rawCsrfHeader[0] : rawCsrfHeader) || '';
        if (!verifyCsrfToken(csrfCookie, csrfHeader, identity.jti || '')) {
          logger.warn('Onboarding CSRF validation failed', {
            method: req.method,
            url: req.url,
          });
          return res.status(403).json({
            error: 'Forbidden',
            message: 'Invalid or missing CSRF token',
          });
        }
      }

      const ipAddress = getClientIp(req);
      const userAgent =
        typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 500) : undefined;

      const { action, organizationName, token } = (req.body || {}) as {
        action?: unknown;
        organizationName?: unknown;
        token?: unknown;
      };

      if (action === 'create_organization') {
        if (typeof organizationName !== 'string' || !organizationName.trim() || organizationName.trim().length > 200) {
          return res.status(400).json({
            error: 'Bad Request',
            message: 'organizationName must be a non-empty string (max 200 characters)',
          });
        }

        try {
          const { organization, user } = await UserRepository.createOrganizationWithAdmin({
            auth0Sub: identity.sub,
            email: identity.email,
            name: identity.name,
            organizationName: organizationName.trim(),
            ipAddress,
            userAgent,
          });

          if (identity.authMethod === 'cookie') {
            setSessionAndClearOnboardingCookies(res, user);
          }

          return res.status(201).json({
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
              role: user.role,
              organizationId: user.orgId,
            },
            organization: {
              id: organization.id,
              name: organization.name,
              createdAt: organization.createdAt,
            },
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.startsWith('USER_DEACTIVATED')) {
            return res.status(403).json({
              error: 'Forbidden',
              code: 'USER_DEACTIVATED',
              message: 'Account has been deactivated',
            });
          }
          if (msg.startsWith('ALREADY_PROVISIONED')) {
            return res.status(409).json({
              error: 'Conflict',
              code: 'ALREADY_PROVISIONED',
              message: 'Account is already provisioned or cannot be onboarded',
            });
          }
          throw err;
        }
      }

      if (action === 'accept_invitation') {
        if (typeof token !== 'string' || !token.trim()) {
          return res.status(400).json({
            error: 'Bad Request',
            message: 'Invitation token is required',
          });
        }

        try {
          const { user } = await UserRepository.acceptInvitation({
            token: token.trim(),
            auth0Sub: identity.sub,
            email: identity.email,
            name: identity.name,
            ipAddress,
            userAgent,
          });

          if (identity.authMethod === 'cookie') {
            setSessionAndClearOnboardingCookies(res, user);
          }

          return res.status(200).json({
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
              role: user.role,
              organizationId: user.orgId,
            },
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.startsWith('USER_DEACTIVATED')) {
            return res.status(403).json({
              error: 'Forbidden',
              code: 'USER_DEACTIVATED',
              message: 'Account has been deactivated',
            });
          }
          if (msg.startsWith('ALREADY_PROVISIONED')) {
            return res.status(409).json({
              error: 'Conflict',
              code: 'ALREADY_PROVISIONED',
              message: 'Account is already provisioned or cannot be onboarded',
            });
          }
          if (msg.startsWith('INVITATION_EMAIL_MISMATCH')) {
            return res.status(403).json({
              error: 'Forbidden',
              code: 'INVITATION_EMAIL_MISMATCH',
              message: msg,
            });
          }
          if (msg.startsWith('INVALID_OR_EXPIRED_INVITATION')) {
            return res.status(400).json({
              error: 'Bad Request',
              code: 'INVALID_OR_EXPIRED_INVITATION',
              message: 'Invitation token is invalid, expired, or already used',
            });
          }
          if (msg.startsWith('LEGACY_ORG_MIGRATION_REQUIRED')) {
            return res.status(403).json({
              error: 'Forbidden',
              code: 'LEGACY_ORG_MIGRATION_REQUIRED',
              message: msg,
            });
          }
          throw err;
        }
      }

      return res.status(400).json({
        error: 'Bad Request',
        message: "Invalid action. Supported actions: 'create_organization', 'accept_invitation'",
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: unknown) {
    logger.error('Onboarding API error', err instanceof Error ? err : new Error(String(err)));
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to process onboarding request',
    });
  }
};

export default async function (req: VercelRequest, res: VercelResponse) {
  await compose(securityHeaders, requestLogger, onboardingRateLimit)(req, res, async () => {
    await handler(req, res);
  });
}

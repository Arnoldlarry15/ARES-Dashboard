/**
 * Unified Authentication Callback Handler
 * Routes to appropriate provider based on 'provider' query parameter
 * Supported providers: auth0, saml
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import {
  createCsrfToken,
  generateOnboardingToken,
  generateTokens,
  isProductionEnvironment,
  verifyOnboardingToken,
  type OnboardingTokenPayload
} from '../../services/auth/jwt';
import { UserRepository } from '../../repositories/userRepository';
import { AuditLogRepository } from '../../repositories/auditLogRepository';
import prisma from '../../utils/db';
import { logger } from '../../lib/logger';
import { getClientIp, securityHeaders } from '../../lib/middleware/security';
import { rateLimit } from '../../lib/middleware/rateLimit';

const callbackRateLimit = rateLimit({
  windowMs: 60_000,
  maxRequests: 20,
  keyPrefix: 'auth-callback',
  message: 'Too many authentication callback attempts, please try again later.',
});

// Cookie expiry constants (in seconds)
const ONE_HOUR = 3600;
const SEVEN_DAYS = 7 * 24 * 60 * 60;
const ONE_DAY = 24 * 60 * 60;

interface SAMLResponse {
  nameID: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  groups?: string[];
  attributes: Record<string, string>;
}

/**
 * Parse SAML response (simplified - in production use passport-saml or similar)
 */
function parseSAMLResponse(samlResponse: string): SAMLResponse {
  // In production, use a proper SAML library like passport-saml
  // This is a placeholder showing the structure
  
  // Decode and parse SAML assertion
  // In real implementation, this would parse XML and verify signatures
  Buffer.from(samlResponse, 'base64').toString('utf-8');
  
  // Extract user attributes from SAML assertion
  // This is simplified - real implementation needs XML parsing and signature verification
  
  return {
    nameID: 'user@example.com',
    email: 'user@example.com',
    firstName: 'John',
    lastName: 'Doe',
    role: 'analyst',
    groups: ['security-team'],
    attributes: {}
  };
}

/**
 * Map SAML groups to ARES roles
 */
function mapGroupsToRole(groups: string[]): string {
  // Map IdP groups to ARES roles
  const roleMapping: Record<string, string> = {
    'ares-admin': 'admin',
    'security-admin': 'admin',
    'red-team-lead': 'red_team_lead',
    'red-team': 'analyst',
    'security-analyst': 'analyst',
    'viewer': 'viewer'
  };

  // Check groups in priority order
  for (const group of groups) {
    const normalizedGroup = group.toLowerCase();
    if (roleMapping[normalizedGroup]) {
      return roleMapping[normalizedGroup];
    }
  }

  // Default to viewer if no matching group
  return 'viewer';
}

/**
 * Handle Auth0 callback
 */
async function handleAuth0Callback(req: VercelRequest, res: VercelResponse) {
  try {
    const { code, state, error, error_description } = req.query;

    // Check for OAuth errors
    if (error) {
      logger.error('Auth0 OAuth error', new Error(error as string), { error_description });
      return res.redirect(`/?error=${encodeURIComponent(error as string)}`);
    }

    // Validate required parameters
    if (typeof code !== 'string' || !code || typeof state !== 'string' || !state) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing authorization code or state'
      });
    }

    // Verify state parameter (constant-time CSRF protection)
    const stateCookie = req.headers.cookie?.match(/auth0_state=([^;]+)/)?.[1] || '';
    const stateBuf = Buffer.from(state, 'utf8');
    const cookieBuf = Buffer.from(stateCookie, 'utf8');
    if (stateBuf.length === 0 || stateBuf.length !== cookieBuf.length || !crypto.timingSafeEqual(stateBuf, cookieBuf)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid state parameter'
      });
    }

    // Get Auth0 configuration
    const auth0Domain = process.env.AUTH0_DOMAIN;
    const auth0ClientId = process.env.AUTH0_CLIENT_ID;
    const auth0ClientSecret = process.env.AUTH0_CLIENT_SECRET;
    const auth0CallbackUrl = process.env.AUTH0_CALLBACK_URL;

    if (!auth0Domain || !auth0ClientId || !auth0ClientSecret || !auth0CallbackUrl) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'Auth0 is not configured properly'
      });
    }

    // Exchange authorization code for tokens
    const tokenResponse = await fetch(`https://${auth0Domain}/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: auth0ClientId,
        client_secret: auth0ClientSecret,
        code: code as string,
        redirect_uri: auth0CallbackUrl
      })
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json();
      logger.error('Token exchange failed', new Error('Token exchange failed'), { errorData });
      return res.redirect(`/?error=token_exchange_failed`);
    }

    const tokens = (await tokenResponse.json()) as { access_token: string; [key: string]: any };

    // Get user info from Auth0
    const userInfoResponse = await fetch(`https://${auth0Domain}/userinfo`, {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`
      }
    });

    if (!userInfoResponse.ok) {
      logger.error('Failed to fetch user info', new Error('Failed to fetch user info'));
      return res.redirect(`/?error=user_info_failed`);
    }

    const userInfo = (await userInfoResponse.json()) as {
      sub: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      [key: string]: unknown;
    };

    const organizationId = userInfo['https://ares.app/org_id'] as string | undefined;
    const isProd = isProductionEnvironment();
    const secureFlag = isProd ? '; Secure' : '';
    const userAgent =
      typeof req.headers['user-agent'] === 'string'
        ? req.headers['user-agent'].slice(0, 500)
        : undefined;
    const ipAddress = getClientIp(req);

    // Resolve internal database user by immutable auth0Sub (never auto-links by email)
    // and record user_login audit log atomically when DATABASE_URL is configured.
    // External Auth0 network calls remain strictly outside the DB transaction.
    let dbUser;
    try {
      if (process.env.DATABASE_URL) {
        dbUser = await prisma.$transaction(async (tx) => {
          const resolvedUser = await UserRepository.resolveAuth0User(
            {
              sub: userInfo.sub,
              email: userInfo.email,
              emailVerified: Boolean(userInfo.email_verified),
              name: userInfo.name,
              orgId: organizationId
            },
            tx
          );
          if (resolvedUser.disabledAt) {
            throw new Error('USER_DEACTIVATED: Account has been deactivated');
          }
          await AuditLogRepository.create(
            {
              orgId: resolvedUser.orgId,
              actorId: resolvedUser.id,
              action: 'user_login',
              target: resolvedUser.id,
              details: { provider: 'auth0' },
              ipAddress,
              userAgent
            },
            tx
          );
          return resolvedUser;
        });
      } else {
        dbUser = await UserRepository.resolveAuth0User({
          sub: userInfo.sub,
          email: userInfo.email,
          emailVerified: Boolean(userInfo.email_verified),
          name: userInfo.name,
          orgId: organizationId
        });
        if (dbUser.disabledAt) {
          throw new Error('USER_DEACTIVATED: Account has been deactivated');
        }
        try {
          await AuditLogRepository.create({
            orgId: dbUser.orgId,
            actorId: dbUser.id,
            action: 'user_login',
            target: dbUser.id,
            details: { provider: 'auth0' },
            ipAddress,
            userAgent
          });
        } catch (auditErr) {
          logger.warn('Failed to write user_login audit log for Auth0 callback', {
            error: auditErr instanceof Error ? auditErr.message : String(auditErr)
          });
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.startsWith('ONBOARDING_REQUIRED') && userInfo.email && userInfo.email_verified) {
        const onboardingToken = generateOnboardingToken({
          sub: userInfo.sub,
          email: userInfo.email,
          emailVerified: true,
          name: userInfo.name
        });
        const decodedOnboarding = verifyOnboardingToken(onboardingToken) as
          | (OnboardingTokenPayload & { jti?: string })
          | null;
        const onboardingJti =
          decodedOnboarding?.jti ||
          crypto.createHash('sha256').update(onboardingToken).digest('hex');
        const onboardingCsrfToken = createCsrfToken(onboardingJti);
        const onboardingCookieName = isProd ? '__Host-onboarding_token' : 'onboarding_token';
        const csrfCookieName = isProd ? '__Host-csrf_token' : 'csrf_token';

        res.setHeader('Set-Cookie', [
          `${onboardingCookieName}=${onboardingToken}; HttpOnly${secureFlag}; SameSite=Lax; Path=/; Max-Age=900`,
          `${csrfCookieName}=${onboardingCsrfToken}${secureFlag}; SameSite=Lax; Path=/; Max-Age=900`,
          `auth0_state=; HttpOnly${secureFlag}; SameSite=Lax; Max-Age=0; Path=/`
        ]);
        return res.redirect(302, '/?onboarding=required');
      }
      if (msg.startsWith('LEGACY_ORG_MIGRATION_REQUIRED')) {
        return res.redirect(302, '/?error=legacy_org_migration_required');
      }
      if (msg.startsWith('USER_DEACTIVATED')) {
        return res.redirect(302, '/?error=user_deactivated');
      }
      throw err;
    }

    // Generate session token bound to authoritative DB userId and role
    const ourTokens = generateTokens({
      userId: dbUser.id,
      email: dbUser.email,
      role: dbUser.role,
      organizationId: dbUser.orgId,
      authProvider: 'auth0'
    });

    const csrfToken = createCsrfToken(ourTokens.jti);
    const accessCookieName = isProd ? '__Host-access_token' : 'access_token';
    const csrfCookieName = isProd ? '__Host-csrf_token' : 'csrf_token';
    const accessTokenExpiry = new Date(Date.now() + ONE_HOUR * 1000).toUTCString();

    res.setHeader('Set-Cookie', [
      `${accessCookieName}=${ourTokens.accessToken}; HttpOnly${secureFlag}; SameSite=Lax; Path=/; Max-Age=${ONE_HOUR}; Expires=${accessTokenExpiry}`,
      `${csrfCookieName}=${csrfToken}${secureFlag}; SameSite=Lax; Path=/; Max-Age=${ONE_HOUR}; Expires=${accessTokenExpiry}`,
      `auth0_state=; HttpOnly${secureFlag}; SameSite=Lax; Max-Age=0; Path=/`
    ]);

    res.redirect(302, '/?auth=success');
  } catch (error: unknown) {
    logger.error('Auth0 callback error', error instanceof Error ? error : new Error(String(error)));
    return res.redirect(`/?error=authentication_failed`);
  }
}

/**
 * Handle SAML callback (disabled until signed XML assertion verification is implemented)
 */
async function handleSAMLCallback(_req: VercelRequest, res: VercelResponse) {
  return res.status(501).json({
    error: 'Not Implemented',
    message: 'SAML SSO is disabled in this release. Configure Auth0 (provider=auth0) or local development auth.'
  });
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  securityHeaders(req, res, () => {});

  let rateLimitPassed = false;
  callbackRateLimit(req, res, () => {
    rateLimitPassed = true;
  });
  if (!rateLimitPassed) {
    return;
  }
  // Get provider from query parameter
  const provider = (req.query.provider as string)?.toLowerCase();

  // SAML uses POST, Auth0 uses GET
  if (provider === 'saml' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. SAML callback requires POST.' });
  }

  if (provider === 'auth0' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Auth0 callback requires GET.' });
  }

  // Route to appropriate provider handler
  switch (provider) {
    case 'auth0':
      return handleAuth0Callback(req, res);
    case 'saml':
      return handleSAMLCallback(req, res);
    default:
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid or missing provider. Supported providers: auth0, saml'
      });
  }
}

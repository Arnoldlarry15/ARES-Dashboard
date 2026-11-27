import crypto from 'node:crypto';
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from 'jose';

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  organizationId?: string;
  permissions?: string[];
  jti?: string;
  authProvider?: 'auth0' | 'local';
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string | string[];
}

export interface VerifiedAuth0Identity {
  sub: string;
  email?: string;
  emailVerified: boolean;
  name?: string;
  orgId?: string;
}

const DEFAULT_JWT_ISSUER = 'ares-api';
const DEFAULT_JWT_AUDIENCE = 'ares-dashboard';
const REFRESH_TOKEN_AUDIENCE = 'ares-refresh';

let cachedJwksDomain: string | null = null;
let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJwksClient(domain: string) {
  if (cachedJwks && cachedJwksDomain === domain) {
    return cachedJwks;
  }
  cachedJwksDomain = domain;
  cachedJwks = createRemoteJWKSet(new URL(`https://${domain}/.well-known/jwks.json`));
  return cachedJwks;
}

export function isProductionEnvironment(): boolean {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
}

export function isLocalAuthAllowed(): boolean {
  if (isProductionEnvironment()) {
    return false;
  }
  return process.env.ALLOW_LOCAL_AUTH === 'true';
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((input.length + 3) % 4);
  return Buffer.from(padded, 'base64');
}

function signHs256Jwt(payload: Record<string, unknown>, secret: string): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;
  const signature = base64UrlEncode(crypto.createHmac('sha256', secret).update(signingInput).digest());
  return `${signingInput}.${signature}`;
}

function verifyHs256Jwt(
  token: string,
  secret: string,
  expectedIssuer: string,
  expectedAudience: string
): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, sigB64] = parts;
  if (!headerB64 || !payloadB64 || !sigB64) return null;

  let header: { alg?: string; typ?: string };
  try {
    header = JSON.parse(base64UrlDecode(headerB64).toString('utf8'));
  } catch {
    return null;
  }

  // Strict algorithm pinning: only HS256 is accepted
  if (header.alg !== 'HS256') {
    return null;
  }

  const signingInput = `${headerB64}.${payloadB64}`;
  const expectedSig = crypto.createHmac('sha256', secret).update(signingInput).digest();
  const actualSig = base64UrlDecode(sigB64);

  if (expectedSig.length !== actualSig.length || !crypto.timingSafeEqual(expectedSig, actualSig)) {
    return null;
  }

  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(base64UrlDecode(payloadB64).toString('utf8'));
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp === 'number' && claims.exp <= now) {
    return null;
  }
  if (typeof claims.nbf === 'number' && claims.nbf > now) {
    return null;
  }
  if (claims.iss !== expectedIssuer) {
    return null;
  }
  if (claims.aud !== expectedAudience) {
    return null;
  }

  return claims;
}

/**
 * Generate cryptographically signed HS256 JWT tokens (non-production / local server auth).
 */
export function generateTokens(payload: TokenPayload): { accessToken: string; refreshToken: string; jti: string } {
  const jwtSecret = process.env.JWT_SECRET;
  const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;

  if (!jwtSecret || !jwtRefreshSecret) {
    throw new Error('JWT_SECRET and JWT_REFRESH_SECRET environment variables must be configured for authentication');
  }

  const now = Math.floor(Date.now() / 1000);
  const issuer = process.env.JWT_ISSUER || DEFAULT_JWT_ISSUER;
  const audience = process.env.JWT_AUDIENCE || DEFAULT_JWT_AUDIENCE;
  const jti = payload.jti || crypto.randomUUID();

  const accessToken = signHs256Jwt(
    {
      ...payload,
      jti,
      iss: issuer,
      aud: audience,
      iat: now,
      exp: now + 3600
    },
    jwtSecret
  );

  const refreshToken = signHs256Jwt(
    {
      ...payload,
      jti,
      type: 'refresh',
      iss: issuer,
      aud: REFRESH_TOKEN_AUDIENCE,
      iat: now,
      exp: now + 604800
    },
    jwtRefreshSecret
  );

  return { accessToken, refreshToken, jti };
}

/**
 * Verify and decode HS256 access token.
 */
export function verifyAccessToken(token: string): TokenPayload | null {
  try {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return null;
    }

    const issuer = process.env.JWT_ISSUER || DEFAULT_JWT_ISSUER;
    const audience = process.env.JWT_AUDIENCE || DEFAULT_JWT_AUDIENCE;
    const claims = verifyHs256Jwt(token, jwtSecret, issuer, audience);
    if (!claims) return null;

    return claims as unknown as TokenPayload;
  } catch {
    return null;
  }
}

/**
 * Verify and decode HS256 refresh token.
 */
export function verifyRefreshToken(token: string): TokenPayload | null {
  try {
    const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;
    if (!jwtRefreshSecret) {
      return null;
    }

    const issuer = process.env.JWT_ISSUER || DEFAULT_JWT_ISSUER;
    const claims = verifyHs256Jwt(token, jwtRefreshSecret, issuer, REFRESH_TOKEN_AUDIENCE);
    if (!claims || claims.type !== 'refresh') {
      return null;
    }

    return claims as unknown as TokenPayload;
  } catch {
    return null;
  }
}

/**
 * Verify an Auth0 RS256 API access token via JWKS.
 * Enforces RS256, exact issuer, API audience (never client_id), and temporal claims.
 */
export async function verifyAuth0AccessToken(token: string): Promise<VerifiedAuth0Identity | null> {
  const domain = process.env.AUTH0_DOMAIN?.trim();
  const audience = process.env.AUTH0_AUDIENCE?.trim();
  const clientId = process.env.AUTH0_CLIENT_ID?.trim();

  if (!domain || !audience) {
    return null;
  }

  // Prevent ID-token confusion: API audience must never equal the SPA/app client ID
  if (clientId && audience === clientId) {
    return null;
  }

  try {
    const header = decodeProtectedHeader(token);
    if (header.alg !== 'RS256') {
      return null;
    }

    const issuer = `https://${domain}/`;
    const jwks = getJwksClient(domain);
    const { payload } = await jwtVerify(token, jwks, {
      algorithms: ['RS256'],
      issuer,
      audience
    });

    if (!payload.sub) {
      return null;
    }

    const emailClaim =
      (typeof payload.email === 'string' ? payload.email : undefined) ||
      (typeof payload['https://ares.app/email'] === 'string' ? (payload['https://ares.app/email'] as string) : undefined);

    const emailVerifiedClaim =
      payload.email_verified === true || payload['https://ares.app/email_verified'] === true;

    return {
      sub: payload.sub,
      email: emailClaim,
      emailVerified: Boolean(emailVerifiedClaim),
      name: typeof payload.name === 'string' ? payload.name : undefined,
      orgId: typeof payload['https://ares.app/org_id'] === 'string'
        ? (payload['https://ares.app/org_id'] as string)
        : undefined
    };
  } catch {
    return null;
  }
}

/**
 * Create a session-bound HMAC-SHA256 CSRF token tied to the JWT jti.
 */
export function createCsrfToken(sessionJti: string): string {
  const secret = process.env.CSRF_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('CSRF_SECRET or JWT_SECRET must be configured');
  }
  const nonce = crypto.randomBytes(16).toString('hex');
  const mac = crypto.createHmac('sha256', secret).update(`${sessionJti}:${nonce}`).digest('hex');
  return `${nonce}.${mac}`;
}

/**
 * Verify a session-bound CSRF token using constant-time comparison.
 */
export function verifyCsrfToken(cookieToken: string, headerToken: string, sessionJti: string): boolean {
  const secret = process.env.CSRF_SECRET || process.env.JWT_SECRET;
  if (!secret || !cookieToken || !headerToken || !sessionJti) {
    return false;
  }

  const cookieBuf = Buffer.from(cookieToken);
  const headerBuf = Buffer.from(headerToken);
  if (cookieBuf.length !== headerBuf.length || !crypto.timingSafeEqual(cookieBuf, headerBuf)) {
    return false;
  }

  const parts = cookieToken.split('.');
  if (parts.length !== 2) return false;
  const [nonce, mac] = parts;
  if (!nonce || !mac) return false;

  const expectedMac = crypto.createHmac('sha256', secret).update(`${sessionJti}:${nonce}`).digest('hex');
  const expectedBuf = Buffer.from(expectedMac);
  const actualBuf = Buffer.from(mac);
  return expectedBuf.length === actualBuf.length && crypto.timingSafeEqual(expectedBuf, actualBuf);
}

/**
 * Extract token from Authorization header
 */
export function extractTokenFromHeader(authHeader?: string): string | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
    return null;
  }

  return parts[1];
}

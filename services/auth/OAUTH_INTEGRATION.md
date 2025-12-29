# OAuth Integration Guide

## Overview

ARES Dashboard supports enterprise authentication via OAuth 2.0/OIDC providers:
- **Auth0**: Flexible identity platform
- **Azure AD/Entra ID**: Microsoft enterprise identity
- **Okta**: Enterprise identity management
- **Google Workspace**: Google authentication
- **GitHub**: Developer authentication

## Current State

**Demo Mode**: Currently uses client-side demo authentication for rapid prototyping.

**Production Ready**: OAuth integration stubs provided for enterprise deployment.

## Architecture

```
User Browser
    ↓
OAuth Provider (Auth0/Azure/Okta)
    ↓
ARES Backend API (/api/auth/callback)
    ↓
Session Created → JWT Token
    ↓
Frontend (with auth token)
```

## Integration Steps

### 1. Auth0 Integration

#### Setup Auth0 Application

1. Create Auth0 account at [auth0.com](https://auth0.com)
2. Create new Application (Regular Web Application)
3. Configure settings:
   - **Allowed Callback URLs**: `https://your-domain.com/api/auth/callback/auth0`
   - **Allowed Logout URLs**: `https://your-domain.com`
   - **Allowed Web Origins**: `https://your-domain.com`

#### Environment Variables

```bash
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_CLIENT_ID=your_client_id
AUTH0_CLIENT_SECRET=your_client_secret
AUTH0_CALLBACK_URL=https://your-domain.com/api/auth/callback/auth0
```

#### Implementation

Install dependencies:
```bash
npm install express-openid-connect
```

Create API endpoint:
```typescript
// api/auth/login/auth0.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const authUrl = `https://${process.env.AUTH0_DOMAIN}/authorize?` +
    `response_type=code&` +
    `client_id=${process.env.AUTH0_CLIENT_ID}&` +
    `redirect_uri=${encodeURIComponent(process.env.AUTH0_CALLBACK_URL!)}&` +
    `scope=openid profile email`;
  
  res.redirect(authUrl);
}
```

```typescript
// api/auth/callback/auth0.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { code } = req.query;
  
  if (!code) {
    return res.status(400).json({ error: 'Missing authorization code' });
  }

  // Exchange code for tokens
  const tokenResponse = await fetch(`https://${process.env.AUTH0_DOMAIN}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: process.env.AUTH0_CLIENT_ID,
      client_secret: process.env.AUTH0_CLIENT_SECRET,
      code,
      redirect_uri: process.env.AUTH0_CALLBACK_URL
    })
  });

  const tokens = await tokenResponse.json();
  
  // Get user info
  const userResponse = await fetch(`https://${process.env.AUTH0_DOMAIN}/userinfo`, {
    headers: { Authorization: `Bearer ${tokens.access_token}` }
  });
  
  const user = await userResponse.json();
  
  // Create session in your database
  // Store user info and generate JWT
  // Redirect to app with session token
  
  res.redirect(`/?token=${sessionToken}`);
}
```

### 2. Azure AD/Entra ID Integration

#### Setup Azure Application

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** → **App registrations**
3. Click **New registration**
4. Configure:
   - **Name**: ARES Dashboard
   - **Redirect URI**: `https://your-domain.com/api/auth/callback/azure`
5. Generate client secret in **Certificates & secrets**

#### Environment Variables

```bash
AZURE_AD_TENANT_ID=your-tenant-id
AZURE_AD_CLIENT_ID=your-application-id
AZURE_AD_CLIENT_SECRET=your-client-secret
AZURE_AD_CALLBACK_URL=https://your-domain.com/api/auth/callback/azure
```

#### Implementation

Install dependencies:
```bash
npm install @azure/msal-node
```

```typescript
// api/auth/login/azure.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const tenantId = process.env.AZURE_AD_TENANT_ID;
  const clientId = process.env.AZURE_AD_CLIENT_ID;
  const redirectUri = process.env.AZURE_AD_CALLBACK_URL;
  
  const authUrl = 
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?` +
    `client_id=${clientId}&` +
    `response_type=code&` +
    `redirect_uri=${encodeURIComponent(redirectUri!)}&` +
    `scope=openid profile email User.Read`;
  
  res.redirect(authUrl);
}
```

```typescript
// api/auth/callback/azure.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ConfidentialClientApplication } from '@azure/msal-node';

const msalConfig = {
  auth: {
    clientId: process.env.AZURE_AD_CLIENT_ID!,
    authority: `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}`,
    clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
  }
};

const cca = new ConfidentialClientApplication(msalConfig);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { code } = req.query;
  
  if (!code) {
    return res.status(400).json({ error: 'Missing authorization code' });
  }

  try {
    const tokenResponse = await cca.acquireTokenByCode({
      code: code as string,
      scopes: ['openid', 'profile', 'email', 'User.Read'],
      redirectUri: process.env.AZURE_AD_CALLBACK_URL!
    });

    // Extract user info from token
    const user = {
      id: tokenResponse.uniqueId,
      email: tokenResponse.account?.username,
      name: tokenResponse.account?.name
    };

    // Create session and redirect
    res.redirect(`/?token=${sessionToken}`);
  } catch (error) {
    console.error('Azure AD auth error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
}
```

### 3. Okta Integration

#### Setup Okta Application

1. Log in to [Okta Admin Console](https://your-domain.okta.com/admin)
2. Go to **Applications** → **Create App Integration**
3. Select **OIDC** and **Web Application**
4. Configure:
   - **Sign-in redirect URIs**: `https://your-domain.com/api/auth/callback/okta`
   - **Sign-out redirect URIs**: `https://your-domain.com`
5. Note Client ID and Client Secret

#### Environment Variables

```bash
OKTA_DOMAIN=your-domain.okta.com
OKTA_CLIENT_ID=your_client_id
OKTA_CLIENT_SECRET=your_client_secret
OKTA_CALLBACK_URL=https://your-domain.com/api/auth/callback/okta
```

#### Implementation

Install dependencies:
```bash
npm install @okta/okta-auth-js @okta/okta-sdk-nodejs
```

```typescript
// api/auth/login/okta.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const authUrl = 
    `https://${process.env.OKTA_DOMAIN}/oauth2/default/v1/authorize?` +
    `client_id=${process.env.OKTA_CLIENT_ID}&` +
    `response_type=code&` +
    `scope=openid profile email&` +
    `redirect_uri=${encodeURIComponent(process.env.OKTA_CALLBACK_URL!)}&` +
    `state=${crypto.randomUUID()}`;
  
  res.redirect(authUrl);
}
```

```typescript
// api/auth/callback/okta.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { code } = req.query;
  
  if (!code) {
    return res.status(400).json({ error: 'Missing authorization code' });
  }

  // Exchange code for tokens
  const tokenResponse = await fetch(
    `https://${process.env.OKTA_DOMAIN}/oauth2/default/v1/token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(
          `${process.env.OKTA_CLIENT_ID}:${process.env.OKTA_CLIENT_SECRET}`
        ).toString('base64')}`
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code as string,
        redirect_uri: process.env.OKTA_CALLBACK_URL!
      })
    }
  );

  const tokens = await tokenResponse.json();
  
  // Get user info
  const userResponse = await fetch(
    `https://${process.env.OKTA_DOMAIN}/oauth2/default/v1/userinfo`,
    {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    }
  );
  
  const user = await userResponse.json();
  
  // Create session and redirect
  res.redirect(`/?token=${sessionToken}`);
}
```

## Backend Permission Enforcement

### Middleware for Authorization

```typescript
// api/middleware/auth.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verify } from 'jsonwebtoken';

export interface AuthenticatedRequest extends VercelRequest {
  user?: {
    id: string;
    email: string;
    role: string;
    organizationId: string;
  };
}

export function requireAuth(req: AuthenticatedRequest, res: VercelResponse, next: () => void) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const decoded = verify(token, process.env.JWT_SECRET!) as any;
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

export function requireRole(allowedRoles: string[]) {
  return (req: AuthenticatedRequest, res: VercelResponse, next: () => void) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

export function requirePermission(resource: string, action: string) {
  return (req: AuthenticatedRequest, res: VercelResponse, next: () => void) => {
    const hasPermission = checkPermission(req.user!, resource, action);
    
    if (!hasPermission) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    
    next();
  };
}
```

### Usage in API Endpoints

```typescript
// api/campaigns/create.ts
import { compose } from '../middleware/security';
import { requireAuth, requirePermission } from '../middleware/auth';

async function handleRequest(req: AuthenticatedRequest, res: VercelResponse) {
  // User is authenticated and has permission
  const campaign = await createCampaign({
    ...req.body,
    organizationId: req.user!.organizationId,
    createdBy: req.user!.id
  });
  
  res.json(campaign);
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  const middleware = compose(
    securityHeaders,
    cors(),
    requireAuth,
    requirePermission('campaigns', 'write')
  );
  
  middleware(req, res, () => handleRequest(req as AuthenticatedRequest, res));
}
```

## Session Management

### JWT Token Generation

```typescript
// services/auth/jwt.ts
import { sign, verify } from 'jsonwebtoken';

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
  organizationId: string;
}

export function generateTokens(payload: TokenPayload) {
  const accessToken = sign(payload, process.env.JWT_SECRET!, {
    expiresIn: '1h'
  });
  
  const refreshToken = sign(payload, process.env.JWT_REFRESH_SECRET!, {
    expiresIn: '7d'
  });
  
  return { accessToken, refreshToken };
}

export function verifyAccessToken(token: string): TokenPayload {
  return verify(token, process.env.JWT_SECRET!) as TokenPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  return verify(token, process.env.JWT_REFRESH_SECRET!) as TokenPayload;
}
```

### Token Refresh Endpoint

```typescript
// api/auth/refresh.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyRefreshToken, generateTokens } from '../../services/auth/jwt';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { refreshToken } = req.body;
  
  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token required' });
  }

  try {
    const payload = verifyRefreshToken(refreshToken);
    const tokens = generateTokens(payload);
    
    res.json(tokens);
  } catch (error) {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
}
```

### Logout Endpoint

```typescript
// api/auth/logout.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { sessionId } = req.body;
  
  if (sessionId) {
    // Delete session from database
    await deleteSession(sessionId);
    
    // If using Redis, delete from cache
    await redis.del(`session:${sessionId}`);
  }
  
  res.json({ success: true });
}
```

## Multi-Tenant Isolation

### Organization Context

```typescript
// api/middleware/organization.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

export function setOrganizationContext(req: AuthenticatedRequest, res: VercelResponse, next: () => void) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Set organization context for database queries
  // This can be used with PostgreSQL row-level security
  req.organizationId = req.user.organizationId;
  
  next();
}
```

### Database Queries with Organization Isolation

```typescript
// repositories/campaignRepository.ts
export class CampaignRepository {
  static async findAll(organizationId: string) {
    return query(
      'SELECT * FROM campaigns WHERE organization_id = $1',
      [organizationId]
    );
  }
  
  static async findById(id: string, organizationId: string) {
    const result = await query(
      'SELECT * FROM campaigns WHERE id = $1 AND organization_id = $2',
      [id, organizationId]
    );
    return result.rows[0];
  }
}
```

## Frontend Integration

### Login Flow

```typescript
// components/AuthProvider.tsx
export function login(provider: 'auth0' | 'azure' | 'okta') {
  // Redirect to OAuth provider
  window.location.href = `/api/auth/login/${provider}`;
}

// Handle callback
useEffect(() => {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  
  if (token) {
    localStorage.setItem('auth_token', token);
    // Remove token from URL
    window.history.replaceState({}, '', '/');
  }
}, []);
```

### API Requests with Token

```typescript
// services/api.ts
export async function apiRequest(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('auth_token');
  
  const response = await fetch(`/api${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers
    }
  });
  
  if (response.status === 401) {
    // Token expired, try to refresh
    await refreshToken();
    // Retry request
    return apiRequest(endpoint, options);
  }
  
  return response.json();
}
```

## Security Best Practices

1. **Never expose secrets** in frontend code
2. **Use HTTPS only** in production
3. **Implement CSRF protection** on all state-changing endpoints
4. **Validate tokens server-side** on every request
5. **Use secure session storage** (httpOnly cookies or backend sessions)
6. **Implement rate limiting** on auth endpoints
7. **Log authentication events** for audit trail
8. **Rotate secrets regularly**
9. **Use short-lived access tokens** with refresh tokens
10. **Implement account lockout** after failed attempts

## Testing

### Unit Tests

```typescript
// tests/auth/jwt.test.ts
describe('JWT Token Generation', () => {
  it('should generate valid access token', () => {
    const payload = {
      userId: 'test-user',
      email: 'test@example.com',
      role: 'analyst',
      organizationId: 'org-123'
    };
    
    const { accessToken } = generateTokens(payload);
    const decoded = verifyAccessToken(accessToken);
    
    expect(decoded.userId).toBe(payload.userId);
    expect(decoded.email).toBe(payload.email);
  });
});
```

### Integration Tests

```typescript
// tests/auth/oauth.test.ts
describe('OAuth Flow', () => {
  it('should redirect to OAuth provider', async () => {
    const response = await fetch('/api/auth/login/auth0', {
      redirect: 'manual'
    });
    
    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toContain('auth0.com');
  });
});
```

## Migration Path

1. **Phase 1**: Implement OAuth endpoints alongside demo auth
2. **Phase 2**: Add backend permission enforcement
3. **Phase 3**: Migrate frontend to use OAuth
4. **Phase 4**: Remove demo authentication
5. **Phase 5**: Enable multi-tenant isolation

## Resources

- [OAuth 2.0 Specification](https://oauth.net/2/)
- [Auth0 Documentation](https://auth0.com/docs)
- [Azure AD Documentation](https://learn.microsoft.com/en-us/azure/active-directory/)
- [Okta Documentation](https://developer.okta.com/docs/)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)

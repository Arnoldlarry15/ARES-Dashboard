# Enterprise Authentication & RBAC Implementation

## Overview

ARES Dashboard includes **server-side authentication and Role-Based Access Control (RBAC)**. This implementation provides:

- ✅ **Real Authentication**: OAuth2/OIDC integration via Auth0 (both backend OAuth2 callback flow and SPA RS256 Bearer flow)
- ✅ **Server-Side RBAC**: Backend enforcement of database-resolved roles and permissions
- ✅ **JWT with Scoped Claims**: Secure token-based authentication (`HttpOnly` cookies or RS256 Bearer tokens)
- ✅ **Multi-Tenant Isolation**: Organization-scoped access with onboarding & invitation workflows
- ✅ **Auditable**: Complete authentication event logging
- ⚠️ **SAML 2.0 Status**: SAML 2.0 SSO is **disabled in this release** (`501 Not Implemented` on `/api/auth/login?provider=saml` and `/api/auth/callback?provider=saml`)

## Architecture

```
┌─────────────────┐
│  User Browser   │
└────────┬────────┘
         │ 1. Click "Login with Auth0"
         ↓
┌─────────────────────────────────────┐
│  /api/auth/login?provider=auth0     │
└────────┬────────────────────────────┘
         │ 2. Redirect to Auth0
         ↓
┌─────────────────────────┐
│   Auth0 (IdP)          │
│   User authenticates    │
└────────┬────────────────┘
         │ 3. Redirect with auth code
         ↓
┌────────────────────────────────────────┐
│  /api/auth/callback?provider=auth0    │
│  - Exchange code for tokens           │
│  - Get user info                      │
│  - Generate JWT                       │
└────────┬───────────────────────────────┘
         │ 4. Set HttpOnly session cookies & redirect
         ↓
┌──────────────────────────────────┐
│  Frontend App                    │
│  Browser sends HttpOnly cookies  │
│  (or SPA RS256 Bearer token)     │
└────────┬─────────────────────────┘
         │ 5. API requests with JWT
         ↓
┌──────────────────────────────┐
│  Protected API Endpoints     │
│  - Validate JWT              │
│  - Check roles/permissions   │
│  - Execute if authorized     │
└──────────────────────────────┘
```

## Quick Start

### 1. Environment Configuration

Add these variables to your Vercel project or `.env.local`:

```bash
# Backend OAuth2 Callback Flow (Regular Web Application)
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_CLIENT_ID=your_client_id
AUTH0_CLIENT_SECRET=your_client_secret
AUTH0_CALLBACK_URL=https://your-domain.com/api/auth/callback?provider=auth0

# Frontend SPA RS256 Bearer Flow (Single Page Application)
VITE_AUTH0_DOMAIN=your-tenant.auth0.com
VITE_AUTH0_CLIENT_ID=your_spa_client_id
# Required for SPA RS256 Bearer mode (must match AUTH0_AUDIENCE so Auth0 issues a JWT rather than an opaque token)
VITE_AUTH0_AUDIENCE=https://your-api-identifier
AUTH0_AUDIENCE=https://your-api-identifier

# JWT Secrets (generate with: openssl rand -base64 32)
JWT_SECRET=your_secure_random_secret_here
JWT_REFRESH_SECRET=your_secure_refresh_secret_here

# Optional: Restrict CORS origins & canonical origin
ALLOWED_ORIGINS=https://your-domain.com,https://app.your-domain.com
APP_URL=https://your-domain.com
```

### 2. Auth0 Setup (Two Supported Flows)

ARES supports two Auth0 integration patterns (see [Auth0 Setup Guide](./AUTH0_SETUP_GUIDE.md) for full SPA details):

#### Option A: Backend OAuth2 Callback Flow (Regular Web Application)
Used when authenticating through `/api/auth/login?provider=auth0` and `/api/auth/callback?provider=auth0`, which exchanges the authorization code server-side and sets `HttpOnly`, `SameSite=Lax` session cookies:
1. Create a **Regular Web Application** in your Auth0 tenant.
2. Configure Application URIs:
   - **Allowed Callback URLs**: `https://your-domain.com/api/auth/callback?provider=auth0`
   - **Allowed Logout URLs**: `https://your-domain.com`
   - **Allowed Web Origins**: `https://your-domain.com`
3. Set `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, and `AUTH0_CALLBACK_URL` in your backend environment.

#### Option B: React SPA RS256 Bearer Flow (Single Page Application)
Used by `@auth0/auth0-react` in the browser (`VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, and required `VITE_AUTH0_AUDIENCE` matching backend `AUTH0_AUDIENCE`), which acquires an RS256 access token in memory and sends `Authorization: Bearer <token>` to `/api/*` endpoints (verified against Auth0 JWKS):
1. Create a **Single Page Web Application** in your Auth0 tenant (do **not** use a Regular Web App client ID for the SPA PKCE flow).
2. Configure **Allowed Callback URLs**, **Allowed Logout URLs**, and **Allowed Web Origins** to your frontend origin (e.g., `http://localhost:5173` or `https://your-domain.com`).
3. See [AUTH0_SETUP_GUIDE.md](./AUTH0_SETUP_GUIDE.md) for step-by-step SPA configuration.

### 3. Custom Claims & Database-Resolved Roles

To propagate organization membership from Auth0 into both the ID token and Access token, add this Auth0 **Post-Login Action**:

```javascript
exports.onExecutePostLogin = async (event, api) => {
  const namespace = 'https://ares.app/';
  const appMetadata = event.user.app_metadata || {};

  // Add organization ID to BOTH ID token and Access token from app_metadata
  if (appMetadata.organizationId) {
    api.idToken.setCustomClaim(`${namespace}org_id`, appMetadata.organizationId);
    api.accessToken.setCustomClaim(`${namespace}org_id`, appMetadata.organizationId);
  }
};
```

> **Database-Resolved Roles**: In ARES, a user's `role` (and resulting RBAC permissions) is **resolved authoritatively from the PostgreSQL database** (`User` record scoped to their organization), not trusted from client-editable token metadata.
>
> **Security Warning**: Always read `organizationId` from `event.user.app_metadata` (admin/backend-controlled). **Never** use `event.user.user_metadata` for tenant or authorization claims, because `user_metadata` can be modified by end users and would allow cross-tenant spoofing or privilege escalation.

### 4. Organization Onboarding Flows

ARES enforces strict multi-tenant organization isolation. Users without an `organizationId` are placed into an onboarding state (`?onboarding=required` or `ONBOARDING_REQUIRED` API responses) until they belong to an organization. Three onboarding flows are supported:

1. **(A) Create New Organization (`/api/onboarding`)**
   - For first-time users creating a new workspace/tenant.
   - The frontend Organization Onboarding UI submits `POST /api/onboarding` with `{ "action": "create_organization", "organizationName": "<name>" }` (including `credentials: 'include'` and `Authorization: Bearer <token>` if an Auth0 SPA access token is present).
   - The backend creates the organization, assigns the user as `admin` of that organization, updates their session/metadata, and completes login.

2. **(B) Invited User (`/api/users?resource=invitations` + `/api/onboarding`)**
   - An organization administrator creates an invitation via `/api/users?resource=invitations` and shares the resulting invitation token with the new user.
   - After authenticating, the invited user selects **Join with Token** in the Organization Onboarding UI, which submits `POST /api/onboarding` with `{ "action": "accept_invitation", "token": "<invitation_token>" }`.
   - The backend validates the invitation token, links the user to the target organization with the invited role, and completes login.

3. **(C) Returning User / Auth0 `app_metadata.organizationId` Claim**
   - Returning users who already belong to an organization have `app_metadata.organizationId` set in Auth0 (or persisted in the ARES database).
   - On login, the Auth0 Post-Login Action injects `https://ares.app/org_id` into both the ID token and Access token, and `/api/auth/callback` issues the scoped session directly without triggering onboarding.

## API Reference

### Authentication Endpoints

#### `GET /api/auth/login?provider={provider}`
Initiates authentication flow with the specified provider.

**Query Parameters**:
- `provider` - Authentication provider (`auth0`; `saml` is **disabled in this release** and returns `501 Not Implemented`)

**Response**: Redirects to provider login page (or returns `501 Not Implemented` for `provider=saml`)

**Examples**:
- Auth0: `GET /api/auth/login?provider=auth0`
- SAML: `GET /api/auth/login?provider=saml` → `501 Not Implemented` (disabled in this release)

---

#### `GET /api/auth/callback?provider={provider}`
Handles authentication callback from the specified provider.

**Query Parameters**:
- `provider` - Authentication provider (`auth0`; `saml` is **disabled in this release** and returns `501 Not Implemented`)
- For Auth0:
  - `code` - Authorization code from Auth0
  - `state` - CSRF protection state parameter

**Response**: Redirects to app with JWT tokens in `HttpOnly`, `SameSite=Lax` cookies (or redirects to `?onboarding=required` if the user has no organization yet)

**Examples**:
- Auth0: `GET /api/auth/callback?provider=auth0&code=...&state=...`
- SAML: `POST /api/auth/callback?provider=saml` → `501 Not Implemented` (disabled in this release)

---

## Middleware Usage

### requireAuth

Validates JWT token and attaches user to request.

```typescript
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const middleware = compose(
    securityHeaders,
    cors(),
    requireAuth
  );

  middleware(req, res, async () => {
    const user = (req as AuthenticatedRequest).user;
    // User is authenticated
    res.json({ userId: user!.userId });
  });
}
```

### requireRole

Restricts access to specific roles.

```typescript
import { requireAuth, requireRole } from '../middleware/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const middleware = compose(
    securityHeaders,
    cors(),
    requireAuth,
    requireRole(['admin', 'red_team_lead']) // Only these roles
  );

  middleware(req, res, async () => {
    // User has required role
    res.json({ message: 'Admin access granted' });
  });
}
```

### requirePermission

Checks for specific permissions.

```typescript
import { requireAuth, requirePermission } from '../middleware/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const middleware = compose(
    securityHeaders,
    cors(),
    requireAuth,
    requirePermission('campaign:write')
  );

  middleware(req, res, async () => {
    // User has campaign:write permission
    res.json({ message: 'Campaign created' });
  });
}
```

### Multiple Permissions

```typescript
import { requireAuth, requireAllPermissions } from '../middleware/auth';

// Require ALL permissions
const middleware = compose(
  requireAuth,
  requireAllPermissions(['campaign:read', 'campaign:write'])
);

// Require ANY permission
import { requireAnyPermission } from '../middleware/auth';

const middleware = compose(
  requireAuth,
  requireAnyPermission(['campaign:admin', 'campaign:write'])
);
```

### Organization Isolation

```typescript
import { requireAuth, requireOrganization } from '../middleware/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const middleware = compose(
    requireAuth,
    requireOrganization() // Ensures user belongs to an organization
  );

  middleware(req, res, async () => {
    const orgId = (req as AuthenticatedRequest).user!.organizationId;
    // Query data filtered by organization
  });
}
```

---

## Role Definitions

ARES supports four built-in roles with hierarchical permissions:

| Role | Description | Typical Permissions |
|------|-------------|-------------------|
| `admin` | System administrator | Full access to all resources |
| `red_team_lead` | Red team manager | Create/edit/delete campaigns, manage team |
| `analyst` | Security analyst | Create/edit campaigns, view team |
| `viewer` | Read-only access | View campaigns and tactics only |

### Permission Examples

Common permission patterns:
- `campaign:read` - View campaigns
- `campaign:write` - Create/edit campaigns
- `campaign:delete` - Delete campaigns
- `team:manage` - Manage team members
- `audit:export` - Export audit logs

---

## Security Best Practices

### Token Storage

**Recommended: Secure HttpOnly Cookies**

Tokens are automatically set as secure HttpOnly cookies by the OAuth callback endpoint:

```typescript
// Tokens are stored in secure cookies (set by backend)
// - HttpOnly: Not accessible via JavaScript
// - Secure: Only sent over HTTPS (in production)
// - SameSite=Lax: CSRF protection

// Frontend doesn't need to handle tokens manually
// Cookies are automatically sent with requests
fetch('/api/campaigns', {
  credentials: 'include' // Include cookies in request
});
```

**Alternative: Authorization Header (for SPAs)**

If using the Auth0 SPA RS256 Bearer token pattern (`getAccessToken()`):

```typescript
// Acquire RS256 access token in memory via @auth0/auth0-react
const token = await getAccessToken();

// Include in API requests
fetch('/api/campaigns', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

**Security Guidelines**:
- ✅ Use HttpOnly cookies for token storage (default in our OAuth2 callback implementation)
- ✅ Enable Secure flag for HTTPS-only transmission
- ✅ Set SameSite=Lax for CSRF protection (paired with double-submit `csrf_token` / `X-CSRF-Token` validation)
- ✅ Use short expiration times (1 hour for access tokens)
- ❌ Never store tokens in localStorage (vulnerable to XSS)
- ❌ Never send tokens in URL query parameters
- ❌ Never log tokens to console or analytics
- ❌ Never store sensitive data in JWT payload

### Token Lifecycle

1. **Access Token**: 1 hour expiration
   - Short-lived for security
   - Used for all API requests (via `HttpOnly` cookie or in-memory SPA Bearer token)
   - In the SPA flow, Auth0 handles silent token renewal in memory via `@auth0/auth0-react`.
   - In the backend OAuth2 callback flow, re-authenticate via `/api/auth/login?provider=auth0` when the 1-hour session cookie expires.

### Rate Limiting

All authentication endpoints are rate-limited:
- Login/Callback: Standard rate limits
- Protected APIs: 100 requests/minute (configurable)

### Audit Logging

All authentication events are logged:
- Login attempts (success/failure)
- Permission denied events
- Role changes

Access audit logs:
```typescript
import { AuthService } from './services/authService';

const logs = AuthService.getAuditLogs({
  action: 'login',
  since: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
});
```

---

## Migration from Demo Auth

Current demo authentication can coexist with real OAuth:

1. **Phase 1**: Deploy OAuth endpoints (✅ Complete)
2. **Phase 2**: Test OAuth in staging environment
3. **Phase 3**: Add "Login with Auth0" button in UI
4. **Phase 4**: Gradually migrate users
5. **Phase 5**: Remove demo auth code

---

## Testing

### Unit Tests

```bash
# Run auth middleware tests
npm run test:unit tests/unit/auth-middleware.test.ts

# Run JWT tests
npm run test:unit tests/unit/jwt.test.ts
```

### Integration Testing

```bash
# Test OAuth flow
curl -i "https://your-domain.com/api/auth/login?provider=auth0"

# Test protected endpoint with Bearer token
curl -X GET "https://your-domain.com/api/campaigns" \
  -H "Authorization: Bearer <access_token>"
```

---

## Troubleshooting

### "Auth0 is not configured"
- Verify all `AUTH0_*` environment variables are set
- Check Vercel deployment environment variables
- Ensure no typos in domain (e.g., `.auth0.com` suffix)

### "Invalid state parameter"
- Clear browser cookies
- Check that cookies are enabled
- Verify `Secure` cookie flag matches HTTPS usage

### "Token verification failed"
- Ensure `JWT_SECRET` is set and consistent
- Check token hasn't expired
- Verify Bearer token format: `Authorization: Bearer <token>`

### "Forbidden" despite valid token
- Check the user's `role` in the PostgreSQL `users` table (scoped to `orgId`) matches `requireRole()` allowed roles—ARES resolves roles and permissions authoritatively from the database, not from Auth0 token claims
- Verify the user's `orgId` (`https://ares.app/org_id` via `app_metadata.organizationId`, or completed `/api/onboarding`) and confirm `users.disabledAt` is `NULL`

---

## Production Deployment

### Vercel Configuration

1. Add environment variables in Vercel dashboard
2. Redeploy to apply changes
3. Test OAuth flow in production
4. Monitor logs for authentication errors

### Azure AD / Okta Support

Similar endpoints can be created for other identity providers:
- `/api/auth/login/azure`
- `/api/auth/callback/azure`
- `/api/auth/login/okta`
- `/api/auth/callback/okta`

See [OAuth Integration Guide](../services/auth/OAUTH_INTEGRATION.md) for detailed setup.

---

## Compliance & Audit

These technical controls are designed to support organizational security and compliance programs (see [SOC2_COMPLIANCE.md](./SOC2_COMPLIANCE.md)); they do not by themselves constitute formal SOC 2, ISO 27001, or GDPR certification:
- **SOC 2 Type II Alignment**: Append-only `audit_logs` (enforced via DB triggers when using a non-owner runtime role) and server-side RBAC
- **ISO 27001 Alignment**: Role-based and organization-scoped access control (`orgId`)
- **GDPR Support**: Authentication, session controls, and soft-delete offboarding (`users.disabledAt`)
- **OWASP Alignment**: `HttpOnly`, `SameSite=Lax` cookies, CSRF protection, and JWKS/JWT verification

Export audit logs for compliance:
```typescript
const csvLogs = AuthService.exportAuditLogs('csv');
// Send to compliance system
```

---

## Additional Resources

- [Auth0 Documentation](https://auth0.com/docs)
- [JWT Best Practices](https://datatracker.ietf.org/doc/html/rfc8725)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OAuth 2.0 Security Best Current Practice](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-security-topics)

---

## Support

For issues or questions:
1. Check [Troubleshooting](#troubleshooting) section
2. Review Auth0 logs in dashboard
3. Check Vercel function logs
4. Open GitHub issue with authentication error details

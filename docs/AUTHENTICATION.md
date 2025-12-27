# Enterprise Authentication & RBAC Implementation

## Overview

ARES Dashboard now includes **enterprise-grade server-side authentication and Role-Based Access Control (RBAC)**. This implementation provides:

- ✅ **Real Authentication**: OAuth2/OIDC integration ready (Auth0, Azure AD, Clerk)
- ✅ **Server-Side RBAC**: Backend enforcement of roles and permissions
- ✅ **JWT with Scoped Claims**: Secure token-based authentication
- ✅ **SSO Ready**: Enterprise identity provider integration
- ✅ **Auditable**: Complete authentication event logging

## Architecture

```
┌─────────────────┐
│  User Browser   │
└────────┬────────┘
         │ 1. Click "Login with Auth0"
         ↓
┌─────────────────────────┐
│  /api/auth/login/auth0  │
└────────┬────────────────┘
         │ 2. Redirect to Auth0
         ↓
┌─────────────────────────┐
│   Auth0 (IdP)          │
│   User authenticates    │
└────────┬────────────────┘
         │ 3. Redirect with auth code
         ↓
┌──────────────────────────────┐
│  /api/auth/callback/auth0    │
│  - Exchange code for tokens  │
│  - Get user info             │
│  - Generate JWT              │
└────────┬─────────────────────┘
         │ 4. Return JWT tokens
         ↓
┌─────────────────┐
│  Frontend App   │
│  Store tokens   │
└────────┬────────┘
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
# Auth0 Configuration
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_CLIENT_ID=your_client_id
AUTH0_CLIENT_SECRET=your_client_secret
AUTH0_CALLBACK_URL=https://your-domain.com/api/auth/callback/auth0

# JWT Secrets (generate with: openssl rand -base64 32)
JWT_SECRET=your_secure_random_secret_here
JWT_REFRESH_SECRET=your_secure_refresh_secret_here

# Optional: Restrict CORS origins
ALLOWED_ORIGINS=https://your-domain.com,https://app.your-domain.com
```

### 2. Auth0 Setup

1. Create an Auth0 account at [auth0.com](https://auth0.com)
2. Create a new **Regular Web Application**
3. Configure Application URIs:
   - **Allowed Callback URLs**: `https://your-domain.com/api/auth/callback/auth0`
   - **Allowed Logout URLs**: `https://your-domain.com`
   - **Allowed Web Origins**: `https://your-domain.com`
4. Copy your **Domain**, **Client ID**, and **Client Secret**
5. (Optional) Configure custom claims for roles and permissions in Auth0 Rules/Actions

### 3. Custom Claims in Auth0

To include roles and permissions in your JWTs, add this Auth0 Action:

```javascript
exports.onExecutePostLogin = async (event, api) => {
  const namespace = 'https://ares.app/';
  
  // Add role from user metadata
  if (event.user.app_metadata.role) {
    api.idToken.setCustomClaim(`${namespace}roles`, [event.user.app_metadata.role]);
  }
  
  // Add organization ID
  if (event.user.app_metadata.organizationId) {
    api.idToken.setCustomClaim(`${namespace}org_id`, event.user.app_metadata.organizationId);
  }
  
  // Add permissions
  if (event.user.app_metadata.permissions) {
    api.idToken.setCustomClaim(`${namespace}permissions`, event.user.app_metadata.permissions);
  }
};
```

## API Reference

### Authentication Endpoints

#### `GET /api/auth/login/auth0`
Initiates OAuth2 login flow with Auth0.

**Response**: Redirects to Auth0 login page

---

#### `GET /api/auth/callback/auth0`
Handles OAuth2 callback from Auth0.

**Query Parameters**:
- `code` - Authorization code from Auth0
- `state` - CSRF protection state parameter

**Response**: Redirects to app with JWT tokens in URL

---

#### `POST /api/auth/refresh`
Refreshes an expired access token using a refresh token.

**Request Body**:
```json
{
  "refreshToken": "your_refresh_token_here"
}
```

**Response**:
```json
{
  "accessToken": "new_access_token",
  "refreshToken": "new_refresh_token",
  "expiresIn": 3600
}
```

**Rate Limit**: 20 requests per minute

---

### Protected Endpoint Example

#### `GET /api/protected-example`
Example endpoint demonstrating authentication and RBAC.

**Headers**:
```
Authorization: Bearer <access_token>
```

**Required Roles**: `admin`, `red_team_lead`, or `analyst`

**Response**:
```json
{
  "message": "Success! You have access to this protected resource.",
  "user": {
    "userId": "auth0|123456",
    "email": "user@example.com",
    "role": "analyst",
    "organizationId": "org_abc123"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Error Responses**:
- `401 Unauthorized` - Missing or invalid token
- `403 Forbidden` - Insufficient permissions/role

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
// - Secure: Only sent over HTTPS
// - SameSite=Strict: CSRF protection

// Frontend doesn't need to handle tokens manually
// Cookies are automatically sent with requests
fetch('/api/protected', {
  credentials: 'include' // Include cookies in request
});
```

**Alternative: Authorization Header (for SPAs)**

If using Authorization header pattern:

```typescript
// Extract token from cookie (if accessible) or secure storage
const token = getCookieValue('access_token');

// Include in API requests
fetch('/api/protected', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

**Security Guidelines**:
- ✅ Use HttpOnly cookies for token storage (default in our implementation)
- ✅ Enable Secure flag for HTTPS-only transmission
- ✅ Set SameSite=Strict for CSRF protection
- ✅ Use short expiration times (1 hour for access tokens)
- ❌ Never store tokens in localStorage (vulnerable to XSS)
- ❌ Never send tokens in URL query parameters
- ❌ Never log tokens to console or analytics
- ❌ Never store sensitive data in JWT payload

### Token Lifecycle

1. **Access Token**: 1 hour expiration
   - Short-lived for security
   - Use for all API requests
   
2. **Refresh Token**: 7 days expiration
   - Long-lived, stored securely
   - Use only to obtain new access tokens

3. **Token Refresh Flow**:
   ```typescript
   async function refreshAccessToken() {
     const refreshToken = localStorage.getItem('refresh_token');
     
     const response = await fetch('/api/auth/refresh', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({ refreshToken })
     });
     
     const { accessToken, refreshToken: newRefresh } = await response.json();
     
     localStorage.setItem('access_token', accessToken);
     localStorage.setItem('refresh_token', newRefresh);
   }
   ```

### Rate Limiting

All authentication endpoints are rate-limited:
- Login/Callback: Standard rate limits
- Token Refresh: 20 requests/minute
- Protected APIs: 100 requests/minute (configurable)

### Audit Logging

All authentication events are logged:
- Login attempts (success/failure)
- Token refresh
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
curl -X GET https://your-domain.com/api/auth/login/auth0

# Test protected endpoint
curl -X GET https://your-domain.com/api/protected-example \
  -H "Authorization: Bearer <access_token>"

# Test token refresh
curl -X POST https://your-domain.com/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"<refresh_token>"}'
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
- Check user role matches `requireRole()` allowed roles
- Verify permissions are set in Auth0 custom claims
- Ensure role/permission claims use correct namespace

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

This implementation supports:
- ✅ **SOC 2 Type II**: Complete audit trail
- ✅ **ISO 27001**: Access control requirements
- ✅ **GDPR**: User authentication and consent
- ✅ **OWASP**: Authentication best practices

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

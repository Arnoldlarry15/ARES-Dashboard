# ARES Dashboard - Vercel Deployment Guide

## Quick Deploy to Vercel

### Option 1: One-Click Deploy (Recommended)
1. Fork this repository to your GitHub account
2. Visit [Vercel](https://vercel.com/new)
3. Import your forked repository
4. Configure environment variables (see below)
5. Click "Deploy"

### Option 2: Vercel CLI
```bash
# Install Vercel CLI globally
npm i -g vercel

# Navigate to project directory
cd ARES-Dashboard

# Deploy
vercel
```

## Environment Variables

Add these to your Vercel project settings (Settings → Environment Variables):

### Security & Runtime Configuration (Production)
- `ALLOWED_ORIGINS` - Comma-separated list of allowed CORS origins (e.g., `https://your-project.vercel.app`)
- `APP_URL` - Canonical application URL (e.g., `https://your-project.vercel.app`)
- `TRUST_PROXY` - Set to `true` when running behind a trusted reverse proxy (such as Vercel) so client IP detection honors `x-forwarded-for` / `x-real-ip`
- `JWT_ISSUER` - Expected/issued JWT `iss` claim (defaults to `ares-api`)
- `JWT_AUDIENCE` - Expected/issued JWT `aud` claim (defaults to `ares-dashboard`)
- `WORKER_SECRET_PREVIOUS` - Previous worker secret accepted during zero-downtime `WORKER_SECRET` rotation
- `ALLOW_PRIVATE_LOCAL_LLM` - Set to `true` only in non-production environments to allow private/loopback `LOCAL_LLM_BASE_URL` targets (disabled in production to prevent SSRF)

### Optional
- `GEMINI_API_KEY` - Your Google Gemini API key (for AI-powered payload generation)
  - If not provided, the app will use static fallback data for testing
  - **Important**: Use `GEMINI_API_KEY` (NOT `VITE_GEMINI_API_KEY`) - the API key is now secured in the backend

### How to Add Environment Variables in Vercel
1. Go to your project in Vercel dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add `GEMINI_API_KEY` with your API key value
4. Select all environments (Production, Preview, Development)
5. Click **Save**
6. **Redeploy** your project for changes to take effect

## Build Configuration

The application uses the following build settings (configured in `vercel.json`):

- **Framework**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

## Post-Deployment

### Access Your Dashboard
After deployment, Vercel will provide you with:
- **Production URL**: `https://your-project.vercel.app`
- **Preview URLs**: Generated for each PR/branch

### Verify Deployment
1. Visit your production URL
2. Verify `/api/health` returns a healthy status and sign in via **Auth0** (the supported OAuth 2.0/OIDC provider; **SAML 2.0 is disabled in this release and returns `501 Not Implemented`**)
3. Try creating and saving campaigns
4. Test theme toggle (dark/light mode)
5. Verify keyboard shortcuts (press `?` to see all shortcuts)

### Custom Domain (Optional)
1. Go to your Vercel project settings
2. Navigate to **Domains**
3. Add your custom domain
4. Follow DNS configuration instructions

## Security Recommendations

### Security Recommendations

### For Production Use
1. **Enable Authentication**: Configure Auth0 (`AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_CALLBACK_URL`) for OAuth 2.0/OIDC login with database-resolved RBAC (`users.role` and `users.orgId` in PostgreSQL). SAML 2.0 is disabled and returns `501 Not Implemented`.
2. **Set Environment Variables**: Add your Gemini API key (`GEMINI_API_KEY`) in Vercel settings
   - The API key is now secured in the backend (not exposed to the frontend)
3. **Enable HTTPS**: Vercel provides this by default
4. **Review Access**: Use Vercel's team/access controls for multi-user management

### Security Headers
The `vercel.json` configures these security headers automatically:
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`

### Rate Limiting & Serverless State
Built-in API rate limiting (`lib/middleware/rateLimit.ts`) uses an **in-memory per-instance store** (`rateLimitStore`):

- **Per-instance scope**: On serverless platforms such as Vercel, each function instance maintains its own independent counter map and resets on cold starts, so rate limits are enforced per instance rather than globally across concurrent instances.
- **Namespace isolation**: Keys are prefixed with `${namespace}:${keyGenerator(req)}` (using `keyPrefix` or normalized request path) so different endpoints do not share counters.
- **Capacity protection (`MAX_NAMESPACE_ENTRIES = 2_000`, `MAX_RATE_LIMIT_ENTRIES = 10_000`, `MAX_NAMESPACES = 32`)**: Capacity is isolated per endpoint namespace so a key flood on one endpoint cannot deny service to unrelated endpoints. On insert, up to `SWEEP_BATCH_SIZE` (`64`) expired entries are swept in O(1) amortized time; if a namespace remains at capacity, its oldest non-blocked entries (`count <= maxRequests`) are evicted first while actively blocked entries (`count > maxRequests`) are preserved. Only if every entry in that namespace is actively blocked are new unknown keys in that namespace shed with HTTP `429 Too Many Requests` and a `Retry-After` header.
- **Proxy IP detection (`TRUST_PROXY`, `TRUSTED_PROXY_HOPS`)**: `getClientIp()` in `lib/middleware/security.ts` only honors proxy headers when `TRUST_PROXY=true`, only trusts `x-vercel-forwarded-for` when `VERCEL=1`, parses `x-forwarded-for` from the right according to `TRUSTED_PROXY_HOPS` (default `1`), validates all candidates with `net.isIP()`, and otherwise falls back to `req.socket?.remoteAddress` (`'unknown'` if invalid/absent).

No external Redis service is required or wired into the runtime rate limiter. If you require strict global rate limiting across multiple serverless instances, configure edge/WAF rate limiting at your hosting layer or replace the in-memory store with a shared backend such as Redis.

## Monitoring & Analytics

Vercel provides built-in:
- **Analytics**: Page views, user metrics
- **Speed Insights**: Core Web Vitals
- **Logs**: Real-time function logs
- **Previews**: Automatic preview deployments for PRs

## Troubleshooting

### Build Fails
- Check that all dependencies are in `package.json`
- Verify Node.js version compatibility (Node.js 24 / `^24.15.0` required)
- Review build logs in Vercel dashboard

### Blank White Page in Production
- Check browser console for JavaScript errors
- Verify the build output contains index.html in the `dist` directory
- Ensure vite.config.ts has `base: '/'` set correctly
- Verify SPA routing is configured in vercel.json with proper rewrites
- Check that all assets are properly referenced with absolute paths

### Environment Variables Not Working
- Ensure variable names are correct (no `VITE_` prefix for backend variables)
- Redeploy after adding environment variables
- Check that variables are set for correct environments

### 404 Errors
- Verify `vercel.json` rewrites configuration
- Ensure SPA routing is properly configured

## Support

For issues or questions:
- Check [Vercel Documentation](https://vercel.com/docs)
- Review project README.md
- Open an issue on GitHub

## Features Available

✅ Complete OWASP LLM Top 10, MITRE ATLAS, MITRE ATT&CK frameworks
✅ Campaign management with save/load/delete
✅ Enterprise authentication & RBAC
✅ Team workspaces & collaboration
✅ Dark/light theme toggle
✅ Keyboard shortcuts
✅ Audit logging
✅ Payload customization editor
✅ Progress persistence

Enjoy your ARES Dashboard deployment! 🚀

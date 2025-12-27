# Architecture Overview

This document provides a high-level overview of the ARES Dashboard architecture, covering the frontend stack, runtime environment, API boundaries, and security posture.

## Frontend Stack

### Core Technologies

- **React 19** - Modern UI library with concurrent features
- **TypeScript** - Type-safe development with strict typing
- **Vite** - Fast build tool and dev server with HMR
- **Tailwind CSS** - Utility-first styling (inline)
- **Lucide React** - Icon library for consistent UI elements

### State Management

- **React Hooks** - useState, useEffect, useCallback for component state
- **LocalStorage** - Persistent state for campaigns, theme, and progress
- **Session Management** - JWT-style tokens with 24-hour expiration

### Key Features

- Single-page application (SPA) with client-side routing
- Component-based architecture with modular design
- Real-time theme switching (dark/light mode)
- Keyboard shortcuts for power users
- Progressive enhancement (works without API)

### Build Output

- Optimized production bundle (~330 KB, gzipped ~96 KB)
- Code splitting and tree shaking enabled
- Static assets with cache headers
- HTML/CSS/JS served from CDN

## Runtime Environment

### Deployment: Vercel Platform

- **Frontend Hosting** - Static files served via Vercel Edge Network
- **Global CDN** - Assets distributed worldwide for low latency
- **Automatic SSL** - HTTPS enabled by default
- **Environment Variables** - Secure storage for API keys and secrets

### Serverless Functions

- **Runtime**: `@vercel/node` v5.5.16
- **Region**: Automatic (closest to user)
- **Execution**: On-demand, stateless functions
- **Timeout**: 10 seconds (default)
- **Cold Start**: ~100-300ms

### Function Configuration

```json
{
  "runtime": "@vercel/node@5.5.16",
  "functions": {
    "api/**/*.ts": {
      "runtime": "@vercel/node@5.5.16"
    }
  }
}
```

## API Boundaries

### Backend API Endpoints

#### `/api/generate-tactic`

**Purpose**: Generate AI-powered attack payloads using Google Gemini

**Method**: POST

**Request**:
```typescript
{
  framework: string;    // "OWASP LLM Top 10" | "MITRE ATLAS" | "MITRE ATT&CK"
  tactic: string;       // Selected tactic ID
  tacticData: {
    name: string;
    description: string;
  }
}
```

**Response**:
```typescript
{
  vectors: Array<{
    id: string;
    name: string;
    description: string;
    severity: string;
    payloads: Array<{
      content: string;
      scenario: string;
    }>;
  }>;
}
```

**Error Handling**:
- 400: Invalid request payload
- 500: API key missing or service error
- Returns static data on failure (graceful degradation)

### Frontend Service Layer

```
Browser
  ↓
services/geminiService.ts (client)
  ↓ POST /api/generate-tactic
api/generate-tactic.ts (serverless)
  ↓ Uses GEMINI_API_KEY
Google Gemini API
```

**Key Services**:

- **geminiService.ts** - AI integration, calls backend API
- **authService.ts** - Authentication, RBAC, session management
- **workspaceService.ts** - Team collaboration features
- **storage.ts** - LocalStorage abstraction
- **campaigns.ts** - Campaign CRUD operations

### Data Flow

1. **User Input** → Component state
2. **User Action** → Service layer
3. **Service Layer** → Backend API (if needed)
4. **Backend API** → External API (Gemini)
5. **Response** → Service layer → Component state
6. **State Update** → UI re-render
7. **Persistence** → LocalStorage (campaigns, theme, progress)

## Security Posture

### API Key Protection

**Never Exposed to Client**:
- API keys stored in Vercel environment variables
- Backend functions access keys securely
- Keys never bundled in frontend JavaScript
- No keys in git repository or client code

### HTTP Security Headers

Applied to all responses via `vercel.json`:

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
```

### Authentication & Authorization

**Demo RBAC System**:
- 4 user roles: Admin, Red Team Lead, Analyst, Viewer
- Granular permissions per role
- Session tokens (client-side, demo only)
- 24-hour token expiration

**Production Considerations**:
- Current auth is for demonstration only
- Integrate with enterprise auth provider (OAuth, SAML)
- Use secure backend session management
- Implement proper JWT validation

### Audit Logging

**Compliance Features**:
- Activity tracking for all user actions
- Campaign access logs (view, edit, delete, share)
- Team management logs (invite, remove, role changes)
- Export capability for compliance (SOC2, ISO 27001, GDPR)

**Storage**:
- Currently client-side (LocalStorage)
- Production: Send to backend logging service
- Retention: Follow compliance requirements

### Input Validation

- TypeScript types enforce structure
- API payload validation on backend
- Sanitization of user inputs
- Error boundaries for UI stability

### Dependency Security

**Current Status**:
- Zero npm vulnerabilities (verified via `npm audit`)
- Regular dependency updates via Dependabot
- CodeQL scanning on PRs and main branch
- Automated security advisories

**Security Scanning**:
- **CodeQL** - Static analysis for vulnerabilities
- **Dependabot** - Automatic dependency updates
- **npm audit** - Dependency vulnerability checks

### Content Security

**No User-Generated Content Storage**:
- No database or persistent backend storage
- All data stored client-side (LocalStorage)
- No XSS risk from stored content
- No SQL injection vectors

### Network Security

**HTTPS Only**:
- TLS 1.3 on Vercel platform
- Secure cookie flags (if using cookies)
- CORS not required (same-origin API)
- No sensitive data in URLs

## Local Development vs Production

### Local Development

```bash
# Frontend only (static fallback data)
npm run dev → http://localhost:5173

# Full-stack (with API)
vercel dev → http://localhost:3000
```

- Static data fallback when API unavailable
- Hot module replacement (HMR)
- Fast refresh for React components
- Source maps enabled

### Production

```bash
npm run build
→ Outputs to /dist
→ Deployed to Vercel Edge Network
```

- Minified and optimized bundles
- Code splitting by route/component
- Asset compression (gzip/brotli)
- Cache headers for static assets
- Serverless functions for API

## Performance Characteristics

- **First Load**: < 1s on modern browsers
- **Time to Interactive**: < 2s
- **Lighthouse Score**: 95+
- **Build Time**: ~10-15 seconds
- **Function Cold Start**: ~100-300ms
- **Function Warm Response**: ~50-150ms

## Scalability Considerations

### Frontend

- **CDN Distribution**: Infinite scale via Vercel Edge Network
- **Static Assets**: Cached globally
- **No Server State**: Each request independent

### Backend Functions

- **Auto-scaling**: Vercel handles concurrent requests
- **Stateless**: No session data in functions
- **Rate Limiting**: Implement via middleware (not included)
- **Caching**: Implement response caching if needed

### Data Storage

- **Current**: Client-side LocalStorage only
- **Limitations**: ~5-10MB per domain
- **Production**: Consider backend database for:
  - Shared campaigns across devices
  - Team collaboration features
  - Audit log persistence
  - User authentication

## Monitoring & Observability

### Available on Vercel

- **Analytics**: Page views, performance metrics
- **Logs**: Function execution logs
- **Errors**: Runtime error tracking
- **Performance**: Core Web Vitals monitoring

### Recommended Additions

- **Error Tracking**: Sentry or similar (not included)
- **User Analytics**: Google Analytics or similar (not included)
- **Custom Metrics**: Application-specific tracking

## Technology Decisions

### Why React 19?

- Latest stable version with concurrent features
- Excellent TypeScript support
- Large ecosystem and community
- Performance optimizations built-in

### Why Vite?

- Fastest build tool available
- Superior HMR experience
- Native ESM support
- Optimal production builds

### Why Vercel?

- Zero-config deployment
- Excellent developer experience
- Built-in serverless functions
- Global CDN and edge network
- Free tier for hobby projects

### Why @vercel/node?

- TypeScript support out of the box
- Simple API for serverless functions
- Automatic environment variable injection
- Compatible with Node.js ecosystem

### Why LocalStorage?

- No backend infrastructure needed
- Fast client-side access
- Sufficient for demo/prototype
- Easy to migrate to backend later

## Future Architecture Considerations

### Backend Database

When scaling beyond prototype:
- Add PostgreSQL/MongoDB for persistent storage
- Use Vercel KV for caching
- Implement proper user authentication backend
- Store audit logs server-side

### Real-time Features

If adding collaboration:
- WebSocket support via Vercel (with limitations)
- Consider Pusher or Ably for real-time sync
- Implement optimistic UI updates

### Multi-Region

For global teams:
- Data residency compliance
- Region-specific deployments
- Edge caching strategies

---

**Architecture version: 1.0 | Last updated: December 2025**

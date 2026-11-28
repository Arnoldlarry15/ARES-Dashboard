# ARES Dashboard
## AI Red Team Operations Console

ARES is an AI Red Team Operations Dashboard for planning, executing, and auditing structured adversarial testing of AI systems across established risk frameworks.

ARES Dashboard is an enterprise-oriented AI red team operations console designed to help security teams, AI safety researchers, and governance programs conduct structured, repeatable, and auditable adversarial testing of AI systems.

ARES provides a centralized workspace for building attack manifests, managing red team campaigns, aligning assessments with recognized frameworks such as OWASP LLM Top 10 and MITRE, and exporting evidence for review and compliance workflows.

The system supports role-based access control, audit logging, persistent campaign storage, and optional AI-assisted scenario generation. A built-in demo mode allows full exploration of core functionality without requiring external API keys.

ARES is designed to serve as the operational execution layer within a broader AI safety and governance ecosystem, enabling disciplined red teaming without automating exploitation or removing human oversight.

## What ARES Is / Is Not

### ARES is:

- An AI red team operations and campaign management tool
- A governance-ready system for structured AI risk assessment
- A collaboration and documentation layer for adversarial testing

### ARES is not:

- An automated hacking or exploit framework
- A consumer product
- A replacement for human judgment or security review

See [PRODUCT_POSITIONING.md](docs/PRODUCT_POSITIONING.md) for complete positioning details.

## 🎯 Why ARES

### The Problem

Security teams need more than ad-hoc prompt tests and manual documentation. Modern AI deployments require:
- **Structured, repeatable workflows** for consistent security assessments
- **Auditable processes** for SOC 2, ISO 27001, and GDPR compliance
- **Framework alignment** with OWASP LLM Top 10, MITRE ATLAS, and ATT&CK
- **Team collaboration** with role-based access and permission management
- **Risk documentation** that meets enterprise governance requirements

Manual approaches to AI security testing are inconsistent, difficult to audit, and don't scale across enterprise teams.

### The Solution

ARES provides a governance-ready AI red-teaming and audit platform that:
- ✅ **Enforces structured methodology** through campaign-based workflows
- ✅ **Generates comprehensive audit trails** with append-only logging (`audit_logs` triggers enforced when using a non-owner DB role; see [SOC2_COMPLIANCE.md](docs/SOC2_COMPLIANCE.md))
- ✅ **Aligns with industry frameworks** (OWASP, MITRE) built into the core platform
- ✅ **Enables team collaboration** with enterprise RBAC and workspace management
- ✅ **Produces risk documentation** to support audit and compliance reviews
- ✅ **Supports both modes**: Static fallback for evaluation + optional AI-generation for enhanced scenarios

### Why It Matters

**For Security Teams:** Move from ad-hoc testing to structured, documented security operations  
**For Compliance Officers:** Get the audit trail and framework alignment to support compliance programs  
**For AI Product Owners:** Validate security controls before production deployment  
**For Auditors:** Access comprehensive, timestamped evidence of security testing activities

## 📋 Typical Use Cases

### 1. Risk Assessment & Pre-Deployment Validation
**Scenario:** Enterprise deploying a new AI-powered customer service chatbot  
**ARES Usage:** 
- Create structured campaign aligned with OWASP LLM Top 10
- Generate and test prompt injection, jailbreak, and data leakage scenarios
- Document findings and mitigation strategies
- Export comprehensive risk assessment for security review

**Outcome:** Validated security controls with documented evidence before production launch

### 2. Compliance Reporting & Audit Preparation
**Scenario:** Annual SOC 2 audit requires evidence of AI security testing  
**ARES Usage:**
- Access complete audit logs of all red-team activities
- Export timestamped campaign documentation
- Generate compliance reports showing framework coverage
- Provide auditor-ready evidence of structured security practices

**Outcome:** Support compliance audits with structured security testing documentation

### 3. Team Collaboration & Knowledge Sharing
**Scenario:** Distributed red team conducting quarterly AI security assessment  
**ARES Usage:**
- Assign campaigns to team members with appropriate roles (Admin, Lead, Analyst, Viewer)
- Share attack scenarios with granular permissions
- Monitor team activity through real-time activity feed
- Collaborate on scenario development and refinement

**Outcome:** Coordinated team effort with clear accountability and access controls

### 4. Continuous Security Testing in CI/CD
**Scenario:** DevSecOps team integrating AI security into deployment pipeline  
**ARES Usage:**
- Export attack manifests as JSON for automated testing
- Version control campaign configurations
- Maintain regression test scenarios across releases
- Track security posture over time

**Outcome:** Integrated security testing with historical tracking

### 5. Framework-Aligned Security Research
**Scenario:** Security researcher studying LLM vulnerability patterns  
**ARES Usage:**
- Conduct reproducible experiments aligned with MITRE ATLAS
- Document methodology and results
- Generate publication-ready evidence
- Share research scenarios with community

**Outcome:** Rigorous, framework-aligned security research

## 👥 User Personas

### Security Engineer
**Role:** Application security professional conducting pre-deployment validation  
**Needs:** Structured testing methodology, framework alignment, integration with SDLC  
**ARES Value:** Campaign-based workflows, export for automation, version-controlled scenarios

### Compliance Officer / Auditor
**Role:** Ensuring AI deployments meet regulatory requirements  
**Needs:** Audit trails, framework coverage, compliance reports, timestamped evidence  
**ARES Value:** Comprehensive logging, OWASP/MITRE alignment, export capabilities, immutable audit trail

### AI Product Owner
**Role:** Managing AI product security and risk posture  
**Needs:** Risk visibility, pre-deployment validation, documented security posture  
**ARES Value:** Risk assessment campaigns, documented findings, executive-ready reports

### Red Team Operator
**Role:** Offensive security specialist conducting adversarial AI testing  
**Needs:** Attack scenario generation, team collaboration, evidence documentation  
**ARES Value:** AI-assisted scenario generation, workspace management, comprehensive documentation

### AI Safety Researcher
**Role:** Academic or industry researcher studying AI vulnerabilities  
**Needs:** Framework alignment, reproducible methodology, publication-ready documentation  
**ARES Value:** Structured experiments, deterministic mode, comprehensive evidence export

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Arnoldlarry15/ARES-Dashboard)

## ✨ Features

### Core Functionality
- 🎯 **Multi-Framework Support**: OWASP LLM Top 10, MITRE ATLAS, and MITRE ATT&CK
- 🔧 **Interactive Builder**: Intuitive 3-step workflow for creating attack manifests
- 🤖 **AI-Powered**: Integration with Google Gemini for dynamic payload generation
- 📦 **Export Ready**: Download executable JSON manifests for testing
- 💾 **Campaign Management**: Save, load, and delete attack scenarios with metadata
- 🔍 **Search & Filter**: Real-time search across all tactics and frameworks

### Enterprise & Governance Features
- 🔐 **Enterprise Authentication**: OAuth2/OIDC via **Auth0** (SAML 2.0 is disabled in this release and returns `501 Not Implemented`)
- 🛡️ **Server-Side RBAC**: Backend enforcement of roles and permissions with multi-level access control
- 🔑 **JWT with Scoped Claims**: 1-hour `HttpOnly` cookie sessions (plus SPA RS256 Bearer tokens with in-memory Auth0 renewal)
- 🏢 **SSO Ready**: Enterprise identity provider integration for seamless authentication
- 👥 **Team Workspaces**: Collaborative red team operations with member management and activity tracking
- 🤝 **Campaign Sharing**: Granular permissions (view, edit, delete, reshare) for controlled collaboration
- 📊 **Audit Logging**: Append-only activity tracking supporting compliance programs (see [SOC2_COMPLIANCE.md](docs/SOC2_COMPLIANCE.md); requires a non-owner DB role)
- 🔒 **Session Management**: 1-hour `HttpOnly` cookie sessions (plus SPA in-memory renewal via `@auth0/auth0-react`)
- 📝 **Activity Feed**: Real-time monitoring of all team actions with full attribution
- 🔐 **Multi-Tenant Support**: Organization-based data isolation and access control
- 📋 **Compliance-Ready**: Built-in audit trail generation for regulatory requirements
- 🎯 **Framework Alignment**: Native OWASP LLM Top 10, MITRE ATLAS, and ATT&CK support

### UX Enhancements
- 🎨 **Modern UI**: 2026 design aesthetics with glassmorphism effects
- 🌓 **Dark/Light Theme**: Toggle between themes with persistent preference
- ⌨️ **Keyboard Shortcuts**: Power user navigation (Ctrl+O, Ctrl+S, Ctrl+K, arrows, ESC, ?)
- ✏️ **Payload Editor**: In-line editing with line numbers and syntax highlighting
- 💾 **Progress Persistence**: Auto-save state between sessions (24-hour expiration)
- ⚡ **Bulk Selection**: Select/Clear all vectors and payloads at once

## 👥 Who Should Use ARES

### ✅ ARES is designed for:

- **Security Engineering Teams** - Security engineers conducting structured, auditable pre-deployment AI validation
- **Compliance Officers & Auditors** - Professionals requiring documented evidence of AI security testing for SOC 2, ISO 27001, GDPR
- **AI Red Team Operators** - Professional offensive security specialists conducting governance-ready adversarial AI testing
- **AI Product Owners** - Product managers requiring risk assessment and security validation for AI deployments
- **AI Safety Researchers** - Academic and industry researchers conducting framework-aligned vulnerability research
- **Enterprise AI Governance Teams** - Risk management teams establishing repeatable AI security processes

### ❌ ARES is NOT for:

- **Unauthorized Testing** - Requires written authorization and proper legal compliance
- **Automated Exploit Execution** - Generates documented scenarios, does not execute exploits
- **Malicious Activities** - Professional security tool for authorized defensive testing only
- **Untrained Users** - Requires security expertise and understanding of AI vulnerabilities
- **Ad-hoc Testing Without Governance** - Designed for structured, auditable workflows

**Important:** ARES is an enterprise security tool requiring proper authorization, security expertise, and governance processes. See [SECURITY_BOUNDARIES.md](docs/SECURITY_BOUNDARIES.md) for complete guidelines.

## 🚀 Quick Deploy

### Deploy to Vercel (Recommended)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Arnoldlarry15/ARES-Dashboard)

**One-click deployment in under 2 minutes:**
1. Click the "Deploy" button above
2. Sign in to Vercel (free account)
3. Configure your project name
4. (Optional) Add environment variables:
   - `GEMINI_API_KEY` - For AI-powered payloads
   - `OPENAI_API_KEY` - Optional ChatGPT/OpenAI provider
   - `ANTHROPIC_API_KEY` - Optional Claude provider
   - `LOCAL_LLM_BASE_URL` - Optional local or OpenAI-compatible model endpoint
   - `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET` - For enterprise authentication (see [Authentication Guide](docs/AUTHENTICATION.md))
   - `JWT_SECRET`, `JWT_REFRESH_SECRET` - For JWT token signing
5. Click "Deploy"

**Important**: Backend API keys are secured server-side and never exposed to the frontend.

For detailed deployment instructions, see [DEPLOY.md](docs/DEPLOY.md) or [QUICK_START.md](docs/QUICK_START.md)

### Local Development (Complete Setup)

1. **Required software**: Node.js `^24.15.0` (Node 24 LTS), npm, Git, and Docker Desktop (for local PostgreSQL + `pgvector`).
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Configure environment variables**:
   ```bash
   cp .env.example .env
   ```
   Set `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CSRF_SECRET`, `WORKER_SECRET`, `CRON_SECRET`, and (for live generation/embeddings) `GEMINI_API_KEY`. Never commit `.env`.
4. **Start local PostgreSQL with `pgvector`**:
   ```bash
   docker run -d --name ares-pgvector-local \
     -e POSTGRES_USER=postgres \
     -e POSTGRES_PASSWORD=postgres \
     -e POSTGRES_DB=ares_dashboard \
     -p 127.0.0.1:5432:5432 \
     pgvector/pgvector:pg16
   ```
   (Or use `docker compose up -d postgres` with `docker-compose.yml`.)
5. **Apply Prisma migrations**:
   ```bash
   npx prisma migrate deploy
   ```
6. **Generate the Prisma client**:
   ```bash
   npm run db:generate
   ```
7. **Configure Auth0 (or local dev auth)**:
   - For Auth0: create a Regular Web App + SPA in your own Auth0 tenant and set `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_CALLBACK_URL`, `VITE_AUTH0_DOMAIN`, and `VITE_AUTH0_CLIENT_ID` (see [docs/AUTH0_SETUP_GUIDE.md](docs/AUTH0_SETUP_GUIDE.md)).
   - For local-only non-production testing without Auth0: set `ALLOW_LOCAL_AUTH=true` in `.env` (`NODE_ENV` must not be `production`).
8. **Configure Gemini API access**:
   - Obtain your own key from Google AI Studio and set `GEMINI_API_KEY` in `.env`.
9. **Start the frontend and backend**:
   - Frontend dev server: `npm run dev`
   - Full serverless API + frontend locally: `npx vercel dev` (requires Vercel CLI; `npm run dev` mounts `/api/generate-tactic` only).
10. **Start and operate the background worker** (required for continuous autonomous execution):
    ```bash
    npm run worker
    ```
    - **Why a self-hosted worker is required:** Vercel Hobby's built-in cron (`/api/generation-jobs?action=recover`, `"0 0 * * *"`) only runs **once per day at 00:00 UTC** and is a stalled-job recovery sweep rather than a continuous queue runner. Browser-triggered `Run Step` is an interactive manual action, not an autonomous scheduler. For continuous background processing independent of browser sessions, run `npm run worker` (or trigger `POST /api/generation-jobs?id=<jobId>&action=worker` with `x-worker-secret` from an external scheduler).
    - **Embedding backfill:** For existing registry rows needing `pgvector` HNSW backfill, run:
      ```bash
      npm run backfill:embeddings -- --dry-run
      npm run backfill:embeddings
      ```
11. **Run tests and production builds**:
    ```bash
    npm run lint
    npm run typecheck
    npm run test:unit
    npm run test:security
    npm run test:integration
    npm run build
    ```
    *Note:* `tests/integration/liveGeminiGeneration.test.ts` skips automatically when `GEMINI_API_KEY` is unset; `realPostgresValidation.test.ts` and `p1OriginalityPg.test.ts` require a `localhost`/`127.0.0.1` PostgreSQL + `pgvector` `DATABASE_URL`.

## 📖 Usage

### Getting Started

1. **Login**: Select a user role (Admin, Red Team Lead, Analyst, or Viewer)
2. **Select Framework**: Choose OWASP LLM Top 10, MITRE ATLAS, or MITRE ATT&CK
3. **Build Attack Manifest**:
   - Pick a tactic from the framework
   - Configure attack vectors
   - Select/customize payloads
   - Export as JSON

### Operating Modes

#### Without API Key (Fallback Mode)
Works fully without an API key using built-in static data:
- All frameworks and tactics available
- Pre-configured attack vectors and payloads
- Full campaign management and team features
- Ideal for testing and evaluation

#### With API Key (AI-Enhanced Mode)
Enhanced with Google Gemini via secure backend API:
- Dynamic, context-aware payload generation
- More diverse and sophisticated attack examples
- Tailored mitigation strategies and references
- **Secure**: API key never exposed to the browser

### Key Workflows

**Campaign Management:**
- Press `Ctrl+S` to save current configuration
- Press `Ctrl+O` to load saved campaigns
- View campaign count badge in header

**Team Collaboration:**
- Click "TEAM" button to manage workspace
- Invite members with specific roles
- Share campaigns with granular permissions
- Monitor team activity in real-time

**Keyboard Shortcuts:**
- Press `?` to view all available shortcuts
- `ESC` to close modals
- `Ctrl+K` to focus search
- `←` / `→` to navigate steps

**Theme Toggle:**
- Click sun/moon icon in header to switch themes
- Preference persists across sessions

## Build for Production

```bash
npm run build
npm run preview
```

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript
- **Backend**: Vercel Serverless Functions
- **Styling**: Tailwind CSS (inline), Glassmorphism effects
- **Icons**: Lucide React
- **AI**: Google Gemini API (secure backend integration)
- **Build Tool**: Vite
- **State Management**: React Hooks, Database-backed with localStorage fallback
- **Database**: PostgreSQL with Prisma ORM
- **Persistence**: Campaign, User, and Audit Log storage
- **Deployment**: Vercel (recommended)

## 💾 Database & Persistence

ARES now supports **durable data persistence** using PostgreSQL with Prisma ORM, replacing localStorage for enterprise deployments.

### Features
- ✅ **Durable Data**: Campaigns and audit logs persist across sessions
- ✅ **Multi-User Support**: Proper user isolation and organization-based access
- ✅ **Audit Trails**: Comprehensive logging for compliance (SOC2, ISO 27001, GDPR)
- ✅ **Auto-Fallback**: Gracefully falls back to localStorage if database is unavailable

### Quick Setup

1. **Choose a database provider:**
   - [Neon](https://neon.tech) (Recommended for Vercel - serverless PostgreSQL)
   - [Supabase](https://supabase.com) (PostgreSQL with extras)
   - [AWS RDS](https://aws.amazon.com/rds/) (Enterprise-grade)
   - Local PostgreSQL

2. **Configure your database URL:**
   ```bash
   # In .env.local or Vercel environment variables
   DATABASE_URL="postgresql://user:password@host:5432/ares_dashboard"
   ```

3. **Initialize the schema:**
   ```bash
   npm run db:generate       # Generate Prisma client
   npx prisma migrate deploy # Apply committed Prisma migrations
   npm run db:studio         # Open database GUI (optional)
   ```

4. **Migrate existing offline/demo data (if upgrading from localStorage):**
   - Export your campaigns as JSON from the dashboard UI
   - Sign in with PostgreSQL persistence enabled and import them via `/api/campaigns`

### Database Schema

The system uses three core models:

```typescript
// User - for authentication and team management
model User {
  id        String   @id
  email     String   @unique
  role      String
  orgId     String
}

// Campaign - for attack scenarios
model Campaign {
  id        String   @id
  name      String
  createdBy String
  createdAt DateTime @default(now())
}

// AuditLog - for compliance and tracking
model AuditLog {
  id        String   @id
  actorId   String
  action    String
  target    String
  timestamp DateTime @default(now())
}
```

### API Integration

The frontend automatically uses database APIs when available:
- `CampaignManager` → `/api/campaigns`
- `AuthService` → `/api/users` and `/api/audit-logs` (`POST /api/users` is deprecated and returns `410 Gone`; use `POST /api/users?resource=invitations` for team invitations)
- Falls back to localStorage if API is unavailable

For detailed setup instructions, see:
- [Database Migration Guide](docs/DATABASE_MIGRATION.md)
- [DATABASE.md](database/DATABASE.md)

## 📁 Project Structure

```
├── App.tsx                      # Main application component
├── constants.tsx                # Framework tactics and metadata
├── types.ts                     # TypeScript type definitions
├── api/
│   ├── generate-tactic.ts       # Synchronous tactic generation API
│   ├── generation-jobs.ts       # Persistent generation jobs, worker step, recovery & credits
│   ├── prompt-vault.ts          # Customer Prompt Vault & duplicate reporting API
│   ├── users.ts                 # User management API (tenant-scoped admin; POST deprecated -> 410 Gone, use ?resource=invitations)
│   ├── campaigns.ts             # Campaign persistence API
│   ├── audit-logs.ts            # Audit trail API
│   ├── health.ts                # Health check endpoint
│   ├── metrics.ts               # Prometheus metrics endpoint
│   └── auth/
│       ├── login.ts             # Unified login / logout initiation
│       └── callback.ts          # Auth0 OAuth callback
├── lib/
│   ├── ai/                      # Generator & independent Evaluator services
│   ├── jobs/                    # Persistent GenerationJob, credit ledger & recovery service
│   ├── middleware/              # Auth, RBAC, CSRF, CORS, rate-limit, error handler
│   ├── originality/             # Multi-stage originality & pgvector HNSW service
│   └── taxonomy/                # OWASP 2026 & MITRE ATLAS v4.5 taxonomies
├── scripts/
│   ├── runWorker.ts             # Self-hosted/local background job worker
│   ├── backfillPromptEmbeddings.ts # Resumable pgvector embedding backfill
│   └── checkSecrets.mjs         # Tracked-file secret scanner
├── prisma/
│   └── schema.prisma           # Database schema definition
├── prisma.config.ts            # Prisma configuration
├── repositories/
│   ├── userRepository.ts       # User data access layer
│   ├── campaignRepository.ts   # Campaign data access layer
│   └── auditLogRepository.ts   # Audit log data access layer
├── components/
│   ├── AuthLogin.tsx           # Authentication UI
│   ├── TeamManagement.tsx      # Team workspace management
│   └── PayloadEditor.tsx       # In-line payload editor
├── services/
│   ├── geminiService.ts        # AI integration service (calls backend)
│   ├── authService.ts          # Authentication & audit logging
│   ├── workspaceService.ts     # Team collaboration
│   └── auth/
│       ├── jwt.ts              # JWT token management
│       └── OAUTH_INTEGRATION.md # OAuth setup guide
├── utils/
│   ├── db.ts                   # Prisma client singleton
│   ├── apiClient.ts            # Type-safe API client
│   ├── storage.ts              # Progress persistence
│   ├── campaigns.ts            # Campaign management (DB + localStorage)
│   └── themeManager.ts         # Theme system
├── database/
│   ├── DATABASE.md             # Database setup guide
│   └── schema/
│       └── postgresql.sql      # SQL schema
├── scripts/
│   ├── validate-db.mjs         # Database validation
│   └── migrate-localstorage.ts # localStorage migration tool
├── types/
│   ├── auth.ts                 # Authentication types
│   └── workspace.ts            # Workspace types
├── index.tsx                   # Application entry point
├── index.html                  # HTML template
├── vercel.json                 # Vercel configuration
├── docs/                       # Documentation
│   ├── CONTRIBUTING.md         # Contribution guidelines
│   ├── CODE_OF_CONDUCT.md      # Community standards
│   ├── ARCHITECTURE.md         # Technical architecture overview
│   ├── AUTHENTICATION.md       # Enterprise authentication guide (NEW)
│   ├── DEPLOY.md               # Deployment guide
│   ├── QUICK_START.md          # Quick deployment reference
│   └── BACKEND_MIGRATION.md    # Backend migration guide
└── package.json                # Dependencies and scripts
```

## 🎯 User Roles & Permissions

ARES supports four enterprise roles with server-side RBAC enforcement:

| Feature | Admin | Red Team Lead | Analyst | Viewer |
|---------|-------|---------------|---------|--------|
| View Tactics & Frameworks | ✅ | ✅ | ✅ | ✅ |
| Create Campaigns | ✅ | ✅ | ✅ | ❌ |
| Edit Campaigns | ✅ | ✅ | ✅ | ❌ |
| Delete Campaigns | ✅ | ✅ | ❌ | ❌ |
| Share Campaigns | ✅ | ✅ | ✅ | ❌ |
| Manage Team | ✅ | ✅ | ❌ | ❌ |
| Invite Members | ✅ | ✅ | ❌ | ❌ |
| View Audit Logs | ✅ | ✅ | ❌ | ❌ |
| Export Audit Logs | ✅ | ❌ | ❌ | ❌ |

**Note**: Role-based access is enforced on both the frontend and backend for enterprise security.

See [Authentication Guide](docs/AUTHENTICATION.md) for OAuth integration and advanced permission management.

## ⚠️ Governance & Responsible Use

**ARES is an enterprise security tool for authorized, structured AI security testing.**

### Authorization & Governance Required
This tool is designed for **authorized security testing within governance frameworks only**. Always:
- ✅ Obtain written authorization before testing any system
- ✅ Operate within established governance and compliance frameworks
- ✅ Use in controlled, isolated test environments with proper oversight
- ✅ Follow responsible disclosure practices and industry standards
- ✅ Comply with applicable laws, regulations, and organizational policies
- ✅ Maintain comprehensive audit trails and documentation

### What ARES Provides
- ✅ Structured campaign planning and risk assessment workflows
- ✅ Framework-aligned attack vectors (OWASP, MITRE) for repeatable testing
- ✅ Immutable audit trails for compliance and governance
- ✅ Team collaboration with role-based access control
- ✅ Documentation and evidence generation for audits

### What ARES Does NOT Provide
- ❌ Automated attack execution or autonomous operations
- ❌ Authorization or legal permission for testing
- ❌ Direct interaction with target systems
- ❌ Replacement for human security expertise and judgment
- ❌ Guarantee of security or compliance certification

**For complete governance guidelines, see:**
- [SECURITY_BOUNDARIES.md](docs/SECURITY_BOUNDARIES.md) - Who should/should not use ARES and governance requirements
- [RESPONSIBLE_USE.md](docs/RESPONSIBLE_USE.md) - Ethical guidelines, best practices, and compliance considerations
- [TRUST_BOUNDARY.md](docs/TRUST_BOUNDARY.md) - Security assumptions, threat model, and trust boundaries

## 🧪 Testing

**Automated Test Suite:**
```bash
# Run all tests
npm test

# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# Security tests
npm run test:security

# E2E tests
npm run test:e2e

# Coverage report
npm run test:coverage
```

**Test Coverage:**
- ✅ 35+ passing tests (unit, integration, security, E2E)
- ✅ Authentication and authorization tests
- ✅ Storage and persistence tests
- ✅ API endpoint validation tests
- ✅ Security permission enforcement tests
- ✅ End-to-end functionality tests

**Development Build:**
```bash
npm run dev
```

**Production Build:**
```bash
npm run build
npm run preview
```

**Build Verification:**
- ✅ Application builds successfully
- ✅ All frameworks accessible
- ✅ Complete workflow tested end-to-end
- ✅ Authentication & RBAC functional
- ✅ Team collaboration operational
- ✅ Theme toggle working
- ✅ Keyboard shortcuts active
- ✅ 35+ automated tests passing

## 🔄 CI/CD & Automation

**Continuous Integration:**
- Automated builds on all PRs and pushes to main
- ESLint code quality checks
- TypeScript type checking
- Unit, integration, and security tests
- E2E tests with Playwright
- Production build verification
- Code coverage reporting

**Security Automation:**
- CodeQL security scanning on all PRs
- Dependabot weekly dependency updates
- Automated vulnerability detection
- Rate limiting on API endpoints
- Input validation and sanitization
- CSRF and CORS protection

**Quality Gates:**
All PRs must pass:
- ✅ Lint checks (`npm run lint`)
- ✅ Type checks (`npm run typecheck`)
- ✅ Unit tests (`npm run test:unit`)
- ✅ Integration tests (`npm run test:integration`)
- ✅ Security tests (`npm run test:security`)
- ✅ Build verification (`npm run build`)
- ✅ CodeQL security scan

**Release Automation:**
- Semantic versioning (semver 2.0.0)
- Automated release workflow on version tags
- Auto-generated release notes
- Build artifacts (ZIP, TAR.GZ)
- SHA-256 checksums
- Pre-release detection

## 📊 Performance

- **Build Size**: ~330 KB (gzipped: ~96 KB)
- **First Load**: < 1s on modern browsers
- **Time to Interactive**: < 2s
- **Lighthouse Score**: 95+

## 🔒 Security

- **Dependency Auditing**: Automated security scanning via CodeQL and Dependabot
- **Automated Security Scanning**: CodeQL analysis runs on all PRs and pushes to main
- **Dependency Management**: Dependabot weekly updates for npm packages
- **Enterprise Authentication**: OAuth2/OIDC via Auth0 (SAML 2.0 disabled in this release; returns `501 Not Implemented`)
- **Server-Side RBAC**: Backend enforcement of roles and permissions
- **JWT Security**: 1-hour `HttpOnly` cookie sessions (plus SPA RS256 Bearer tokens with in-memory renewal)
- **Secure API Keys**: All secrets protected on backend, never exposed to client
- **Serverless Architecture**: API calls routed through secure backend functions
- **Security Headers**: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection
- **Authentication**: Enterprise RBAC system (integrate with your auth provider in production)
- **Audit Logging**: Comprehensive activity tracking for compliance (see [SOC2_COMPLIANCE.md](docs/SOC2_COMPLIANCE.md))
- **Session Management**: 1-hour `HttpOnly` cookie sessions (plus SPA in-memory renewal)
- **Threat Model**: Comprehensive threat analysis and mitigation strategies
- **Security Policy**: Documented vulnerability reporting and response procedures

**Enterprise Security Features:**
- **Rate Limiting**: Per-endpoint in-memory limits per IP (1-minute window): `60/min` default (`users`, `campaigns`, `audit-logs`, `generation-jobs`), `100/min` (`generate-tactic`), `30/min` (`prompt-vault`, `generation-jobs` recover), and `20/min` (`onboarding`, `auth/login`, `auth/callback`)
- **Input Validation**: Type checking, length limits, pattern matching
- **Sanitization**: XSS prevention and output encoding
- **CORS Protection**: Configurable cross-origin policies
- **CSRF Protection**: Token-based protection for state-changing operations
- **Backend Authorization**: Permission enforcement on all API endpoints
- **Multi-tenant Ready**: Organization-based data isolation
- **Audit Trail**: Full compliance logging for SOC 2, ISO 27001, GDPR

**📋 Enterprise Trust Documentation:**
- [TRUST_BOUNDARY.md](docs/TRUST_BOUNDARY.md) - **NEW**: Explicit threat model - what ARES defends against and does NOT defend against
- [SECURITY_BOUNDARIES.md](docs/SECURITY_BOUNDARIES.md) - **NEW**: Who should use ARES, misuse prevention, and safeguards
- [AI_BEHAVIOR.md](docs/AI_BEHAVIOR.md) - **NEW**: Determinism vs. probabilistic outputs, hallucination handling, reproducibility
- [VERSION_GUARANTEES.md](docs/VERSION_GUARANTEES.md) - **NEW**: Behavioral stability promises and version commitments
- [PRODUCT_POSITIONING.md](docs/PRODUCT_POSITIONING.md) - **NEW**: Clear product positioning and identity
- [AUTHENTICATION.md](docs/AUTHENTICATION.md) - Enterprise authentication & OAuth guide
- [SECURITY.md](docs/SECURITY.md) - Security policy and vulnerability reporting
- [THREAT_MODEL.md](docs/THREAT_MODEL.md) - Comprehensive threat modeling and risk assessment
- [RESPONSIBLE_USE.md](docs/RESPONSIBLE_USE.md) - Ethical guidelines and responsible use policies
- [DATA_HANDLING.md](docs/DATA_HANDLING.md) - Data lifecycle, privacy, and compliance
- [INCIDENT_RESPONSE.md](docs/INCIDENT_RESPONSE.md) - Security incident procedures
- [SOC2_COMPLIANCE.md](docs/SOC2_COMPLIANCE.md) - SOC 2 compliance framework

### API Security Architecture

```
┌─────────────────┐
│  User Browser   │
└────────┬────────┘
         │ 1. Login with Auth0
         ↓
┌─────────────────────────┐
│  Auth0 (Identity)       │
│  Authenticate user      │
└────────┬────────────────┘
         │ 2. Return auth code
         ↓
┌──────────────────────────────┐
│  Backend API (Vercel)        │
│  - Exchange code for tokens  │
│  - Generate JWT with roles   │
│  - Validate all requests     │
└────────┬─────────────────────┘
         │ 3. Return JWT
         ↓
┌─────────────────┐
│  Protected APIs │
│  - Verify JWT   │
│  - Check RBAC   │
│  - Execute      │
└─────────────────┘
```

All secrets (API keys, JWT secrets, OAuth credentials) are stored in Vercel environment variables and accessed only by the backend, ensuring they're never exposed to the browser.

**Key Features:**
- 🔐 OAuth2/OIDC authentication flow
- 🛡️ Server-side role and permission enforcement
- 🔑 1-hour `HttpOnly` cookie sessions (plus SPA in-memory renewal)
- 🏢 Multi-tenant organization isolation
- 📊 Complete audit trail for compliance

## 📄 License

See [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guidelines](docs/CONTRIBUTING.md) and [Code of Conduct](docs/CODE_OF_CONDUCT.md) before submitting a Pull Request.

**Quick Links:**
- [CONTRIBUTING.md](docs/CONTRIBUTING.md) - Installation, development setup, PR guidelines, CI expectations
- [CODE_OF_CONDUCT.md](docs/CODE_OF_CONDUCT.md) - Community standards and enforcement
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - Technical architecture and design decisions

## 🙏 Acknowledgments

- OWASP Foundation for LLM security guidelines
- MITRE Corporation for ATLAS and ATT&CK frameworks
- Google for Gemini AI capabilities
- Vercel for deployment platform

## 📞 Support & Documentation

### Production & Operations

- **Observability**: See [OBSERVABILITY.md](docs/OBSERVABILITY.md) - **NEW** Monitoring, metrics, logs, and SLOs
- **Secrets Management**: See [SECRETS_MANAGEMENT.md](docs/SECRETS_MANAGEMENT.md) - **NEW** Lifecycle and rotation
- **Database Migrations**: See [DATABASE_MIGRATIONS.md](docs/DATABASE_MIGRATIONS.md) - **NEW** Zero-downtime strategies
- **Operational Runbooks**: See [OPERATIONAL_RUNBOOKS.md](docs/OPERATIONAL_RUNBOOKS.md) - **NEW** Production procedures
- **Kubernetes Deployment**: See [helm/ares-dashboard/README.md](helm/ares-dashboard/README.md) - **NEW** Helm chart guide

### Security Operations

- **Penetration Testing**: See [PENETRATION_TESTING.md](docs/PENETRATION_TESTING.md) - **NEW** Security assessment guide
- **Red/Blue Team Exercises**: See [RED_BLUE_TEAM_EXERCISES.md](docs/RED_BLUE_TEAM_EXERCISES.md) - **NEW** Security drills
- **Security Policy**: See [SECURITY.md](docs/SECURITY.md)
- **Threat Model**: See [THREAT_MODEL.md](docs/THREAT_MODEL.md)
- **Incident Response**: See [INCIDENT_RESPONSE.md](docs/INCIDENT_RESPONSE.md)

### Development & Deployment

- **Issues**: Open an issue on GitHub
- **Authentication Setup**: See [AUTHENTICATION.md](docs/AUTHENTICATION.md) - Enterprise auth guide
- **Deployment Help**: See [DEPLOY.md](docs/DEPLOY.md) or [QUICK_START.md](docs/QUICK_START.md)
- **Docker Deployment**: See [DOCKER.md](docs/DOCKER.md)
- **Contributing**: See [CONTRIBUTING.md](docs/CONTRIBUTING.md)
- **Architecture**: See [ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Developer Guide**: See [DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md)
- **Testing Guidelines**: See [TESTING.md](docs/TESTING.md)

### Compliance & Governance

- **Code of Conduct**: See [CODE_OF_CONDUCT.md](docs/CODE_OF_CONDUCT.md)
- **Changelog**: See [CHANGELOG.md](docs/CHANGELOG.md)
- **Data Handling**: See [DATA_HANDLING.md](docs/DATA_HANDLING.md)
- **Responsible Use**: See [RESPONSIBLE_USE.md](docs/RESPONSIBLE_USE.md)
- **SOC 2 Compliance**: See [SOC2_COMPLIANCE.md](docs/SOC2_COMPLIANCE.md)
- **Release Management**: See [RELEASE_MANAGEMENT.md](docs/RELEASE_MANAGEMENT.md)
- **Roadmap**: See [ROADMAP.md](docs/ROADMAP.md)

### API & Integration

- **Database Setup**: See [database/DATABASE.md](database/DATABASE.md)
- **OAuth Integration**: See [services/auth/OAUTH_INTEGRATION.md](services/auth/OAUTH_INTEGRATION.md)
- **API Documentation**: See [api/openapi.yaml](api/openapi.yaml)

## 📋 Compliance & Governance

ARES provides technical controls designed to support enterprise compliance programs (not formal certification on their own; see [SOC2_COMPLIANCE.md](docs/SOC2_COMPLIANCE.md) and run PostgreSQL with a non-owner, non-superuser role so `audit_logs` triggers cannot be bypassed):

- **SOC 2 Type II Alignment**: Append-only audit logging (`audit_logs` triggers) and server-side RBAC
- **ISO 27001 Alignment**: Role-based and organization-scoped (`orgId`) access controls
- **GDPR Support**: Data privacy controls, export, and `users.disabledAt` soft-delete offboarding (with proper configuration)
- **OWASP**: Aligned with OWASP Top 10 and OWASP LLM Top 10
- **MITRE**: Full ATLAS and ATT&CK framework coverage

**Enterprise Features:**
- ✅ **Production Hardening**: OAuth2/OIDC auth (SAML 2.0 disabled in this release, `501 Not Implemented`), Prometheus metrics, health checks
- ✅ **Observability**: Metrics, logs, traces, and SLO definitions
- ✅ **Secrets Management**: Lifecycle management and automated rotation
- ✅ **Database Migrations**: Zero-downtime strategies and backup procedures
- ✅ **Kubernetes Ready**: Production-ready Helm chart with HA configuration
- ✅ **Docker Images**: Multi-arch builds (amd64, arm64) in GitHub Container Registry
- ✅ **Security Operations**: Penetration testing and red/blue team exercise guides
- ✅ **Operational Runbooks**: Complete production procedures and troubleshooting
- ✅ **Automated Testing**: 35+ unit, integration, security, and E2E tests
- ✅ **API Hardening**: Rate limiting, validation, sanitization, CORS, CSRF
- ✅ **Database Ready**: PostgreSQL schema with multi-tenant support
- ✅ **OAuth2/OIDC**: Auth0 ready for production (SAML 2.0 disabled in this release, `501 Not Implemented`)
- ✅ **Audit Trail**: Complete compliance logging
- ✅ **Incident Response**: Documented security procedures
- ✅ **Release Management**: Semantic versioning with CI/CD
- ✅ **Developer Docs**: Comprehensive onboarding and guides

**Documentation:**
- [OBSERVABILITY.md](docs/OBSERVABILITY.md) - **NEW**: Monitoring, metrics, logs, and SLOs
- [SECRETS_MANAGEMENT.md](docs/SECRETS_MANAGEMENT.md) - **NEW**: Secrets lifecycle and rotation
- [DATABASE_MIGRATIONS.md](docs/DATABASE_MIGRATIONS.md) - **NEW**: Zero-downtime migration strategies
- [OPERATIONAL_RUNBOOKS.md](docs/OPERATIONAL_RUNBOOKS.md) - **NEW**: Production operations procedures
- [PENETRATION_TESTING.md](docs/PENETRATION_TESTING.md) - **NEW**: Security assessment guide
- [RED_BLUE_TEAM_EXERCISES.md](docs/RED_BLUE_TEAM_EXERCISES.md) - **NEW**: Security operation exercises
- [DATA_HANDLING.md](docs/DATA_HANDLING.md) - Data lifecycle and privacy policies
- [RESPONSIBLE_USE.md](docs/RESPONSIBLE_USE.md) - Ethical use guidelines
- [THREAT_MODEL.md](docs/THREAT_MODEL.md) - Security threat analysis
- [ROADMAP.md](docs/ROADMAP.md) - Product roadmap and future plans
- [SOC2_COMPLIANCE.md](docs/SOC2_COMPLIANCE.md) - SOC 2 compliance framework
- [INCIDENT_RESPONSE.md](docs/INCIDENT_RESPONSE.md) - Incident handling procedures


---

**Built with ❤️ for the AI Security Community**

*ARES Dashboard v1.0.0 - Production Hardening & Enterprise Release*

**Production-Ready Features:**
- 🔐 OAuth2/OIDC authentication via Auth0 (SAML 2.0 disabled in this release; returns `501 Not Implemented`)
- 📊 Prometheus metrics and health check endpoints
- 🔍 Comprehensive observability with OpenTelemetry support
- 🔑 Secrets management with automated rotation procedures
- 🗄️ Zero-downtime database migrations and backup strategies
- ☸️ Production-ready Helm chart for Kubernetes deployment
- 🐳 Multi-arch Docker images in GitHub Container Registry
- 🛡️ Security operations guides (pen testing, red/blue team exercises)
- 📚 Complete operational runbooks for production operations
- 📋 Comprehensive security and compliance documentation
- 🔒 Threat modeling and security controls
- 📊 Audit logging for SOC 2 / ISO 27001 compliance  
- 🛡️ OAuth2/OIDC integration for production deployments (SAML 2.0 disabled in this release)
- 📦 Docker and self-hosted deployment support
- 🔍 Extensive testing framework and guidelines

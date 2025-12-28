# ARES Dashboard

**A**I **R**ed-teaming & **E**valuation **S**ystem

> **ARES is an AI red-teaming and governance dashboard designed to help organizations safely evaluate, document, and mitigate LLM risks across the OWASP LLM Top 10 and MITRE ATLAS frameworks.**

An enterprise-grade platform for AI security professionals to conduct structured security assessments, generate compliant attack manifests, and maintain comprehensive audit trails for regulatory compliance.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Arnoldlarry15/ARES-Dashboard)

## ✨ Features

### Core Functionality
- 🎯 **Multi-Framework Support**: OWASP LLM Top 10, MITRE ATLAS, and MITRE ATT&CK
- 🔧 **Interactive Builder**: Intuitive 3-step workflow for creating attack manifests
- 🤖 **AI-Powered**: Integration with Google Gemini for dynamic payload generation
- 📦 **Export Ready**: Download executable JSON manifests for testing
- 💾 **Campaign Management**: Save, load, and delete attack scenarios with metadata
- 🔍 **Search & Filter**: Real-time search across all tactics and frameworks

### Enterprise Features
- 🔐 **Enterprise Authentication**: OAuth2/OIDC ready (Auth0, Azure AD, Clerk)
- 🛡️ **Server-Side RBAC**: Backend enforcement of roles and permissions
- 🔑 **JWT with Scoped Claims**: Secure token-based authentication
- 🏢 **SSO Ready**: Enterprise identity provider integration
- 👥 **Team Workspaces**: Collaborative red team operations with member management
- 🤝 **Campaign Sharing**: Granular permissions (view, edit, delete, reshare)
- 📊 **Audit Logging**: Comprehensive activity tracking for compliance (SOC2, ISO 27001, GDPR)
- 🔒 **Session Management**: JWT tokens with automatic refresh
- 📝 **Activity Feed**: Real-time monitoring of all team actions
- 🔐 **Multi-Tenant Support**: Organization-based data isolation

### UX Enhancements
- 🎨 **Modern UI**: 2026 design aesthetics with glassmorphism effects
- 🌓 **Dark/Light Theme**: Toggle between themes with persistent preference
- ⌨️ **Keyboard Shortcuts**: Power user navigation (Ctrl+O, Ctrl+S, Ctrl+K, arrows, ESC, ?)
- ✏️ **Payload Editor**: In-line editing with line numbers and syntax highlighting
- 💾 **Progress Persistence**: Auto-save state between sessions (24-hour expiration)
- ⚡ **Bulk Selection**: Select/Clear all vectors and payloads at once

## 🚀 Quick Deploy

### Deploy to Vercel (Recommended)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Arnoldlarry15/ARES-Dashboard)

**One-click deployment in under 2 minutes:**
1. Click the "Deploy" button above
2. Sign in to Vercel (free account)
3. Configure your project name
4. (Optional) Add environment variables:
   - `GEMINI_API_KEY` - For AI-powered payloads
   - `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET` - For enterprise authentication (see [Authentication Guide](docs/AUTHENTICATION.md))
   - `JWT_SECRET`, `JWT_REFRESH_SECRET` - For JWT token signing
5. Click "Deploy"

**Important**: Backend API keys are secured server-side and never exposed to the frontend.

For detailed deployment instructions, see [DEPLOY.md](docs/DEPLOY.md) or [QUICK_START.md](docs/QUICK_START.md)

### Local Development

**Prerequisites:**
- Node.js 20.x and npm
- (Optional) Google Gemini API key for AI-generated payloads

**Installation:**

1. Clone the repository:
```bash
git clone https://github.com/Arnoldlarry15/ARES-Dashboard.git
cd ARES-Dashboard
```

2. Install dependencies:
```bash
npm install
```

3. (Optional) Set up environment variables for local development:
   - Copy `.env.example` to `.env.local`
   - Add configuration:
   ```bash
   # Database (for persistent storage - optional for dev)
   DATABASE_URL="postgresql://user:password@host:5432/ares_dashboard"
   # Use Neon (https://neon.tech), Supabase (https://supabase.com), or local PostgreSQL
   
   # AI-powered payloads (optional)
   GEMINI_API_KEY=your_actual_api_key_here
   
   # Enterprise authentication (optional, for production)
   AUTH0_DOMAIN=your-tenant.auth0.com
   AUTH0_CLIENT_ID=your_client_id
   AUTH0_CLIENT_SECRET=your_client_secret
   AUTH0_CALLBACK_URL=http://localhost:3000/api/auth/callback/auth0
   
   # JWT secrets (required for auth)
   JWT_SECRET=your_secure_random_secret
   JWT_REFRESH_SECRET=your_secure_refresh_secret
   ```
   - Get Gemini API key from: https://aistudio.google.com/apikey
   - Get Auth0 credentials from: https://auth0.com (see [Authentication Guide](docs/AUTHENTICATION.md))
   - For database setup, see [Database Migration Guide](docs/DATABASE_MIGRATION.md)
   - **Note**: For local development with backend APIs, use `vercel dev` instead of `npm run dev`

3a. (Optional) Set up persistent database:
   ```bash
   # Generate Prisma client
   npm run db:generate
   
   # Push schema to database
   npm run db:push
   
   # Open Prisma Studio to view data
   npm run db:studio
   ```
   - See [Database Migration Guide](docs/DATABASE_MIGRATION.md) for detailed setup instructions
   - Works with Neon, Supabase, AWS RDS, or local PostgreSQL

4. Start the development server:
```bash
# Without API key (uses static fallback data)
npm run dev

# With API key (requires Vercel CLI)
npm install -g vercel
vercel dev
```

5. Open your browser to:
   - `http://localhost:5173` (npm run dev)
   - `http://localhost:3000` (vercel dev)

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
- **State Management**: React Hooks, LocalStorage
- **Deployment**: Vercel (recommended)

## 📁 Project Structure

```
├── App.tsx                      # Main application component
├── constants.tsx                # Framework tactics and metadata
├── types.ts                     # TypeScript type definitions
├── api/
│   ├── generate-tactic.ts      # Serverless API for AI (secure)
│   ├── protected-example.ts    # Example protected endpoint with RBAC
│   ├── auth/
│   │   ├── refresh.ts          # Token refresh endpoint
│   │   ├── login/
│   │   │   └── auth0.ts        # Auth0 login initiation
│   │   └── callback/
│   │       └── auth0.ts        # Auth0 OAuth callback
│   ├── middleware/
│   │   ├── auth.ts             # Authentication & RBAC middleware
│   │   ├── rateLimit.ts        # Rate limiting
│   │   ├── validation.ts       # Request validation
│   │   └── security.ts         # Security headers & CORS
│   └── tsconfig.json           # API TypeScript config
├── components/
│   ├── AuthLogin.tsx           # Authentication UI
│   ├── TeamManagement.tsx      # Team workspace management
│   └── PayloadEditor.tsx       # In-line payload editor
├── services/
│   ├── geminiService.ts        # AI integration service (calls backend)
│   ├── authService.ts          # Authentication & RBAC
│   ├── workspaceService.ts     # Team collaboration
│   └── auth/
│       ├── jwt.ts              # JWT token management
│       └── OAUTH_INTEGRATION.md # OAuth setup guide
├── utils/
│   ├── storage.ts              # Progress persistence
│   ├── campaigns.ts            # Campaign management
│   └── themeManager.ts         # Theme system
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

## Security Note

This tool is designed for **authorized security testing only**. The payloads and techniques demonstrated are for educational and authorized penetration testing purposes. Always:
- Obtain proper authorization before testing
- Use in controlled environments
- Follow responsible disclosure practices
- Comply with applicable laws and regulations

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
- ✅ Application builds successfully (0 vulnerabilities)
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

- **Zero Vulnerabilities**: Passed npm audit with 0 vulnerabilities
- **Automated Security Scanning**: CodeQL analysis runs on all PRs and pushes to main
- **Dependency Management**: Dependabot weekly updates for npm packages
- **Enterprise Authentication**: OAuth2/OIDC ready with Auth0, Azure AD, or Clerk
- **Server-Side RBAC**: Backend enforcement of roles and permissions
- **JWT Security**: Signed tokens with automatic expiration and refresh
- **Secure API Keys**: All secrets protected on backend, never exposed to client
- **Serverless Architecture**: API calls routed through secure backend functions
- **Security Headers**: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection
- **Authentication**: Enterprise RBAC system (integrate with your auth provider in production)
- **Audit Logging**: Comprehensive activity tracking for compliance
- **Session Management**: 24-hour JWT-style tokens with device tracking
- **Threat Model**: Comprehensive threat analysis and mitigation strategies
- **Security Policy**: Documented vulnerability reporting and response procedures

**Enterprise Security Features:**
- **Rate Limiting**: 100 requests/minute per IP address (configurable)
- **Input Validation**: Type checking, length limits, pattern matching
- **Sanitization**: XSS prevention and output encoding
- **CORS Protection**: Configurable cross-origin policies
- **CSRF Protection**: Token-based protection for state-changing operations
- **Backend Authorization**: Permission enforcement on all API endpoints
- **Multi-tenant Ready**: Organization-based data isolation
- **Audit Trail**: Full compliance logging for SOC 2, ISO 27001, GDPR

**📋 Enterprise Trust Artifacts:**
- [AUTHENTICATION.md](docs/AUTHENTICATION.md) - **NEW**: Enterprise authentication & OAuth guide
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
- 🔑 JWT tokens with automatic refresh
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

- **Issues**: Open an issue on GitHub
- **Authentication Setup**: See [AUTHENTICATION.md](docs/AUTHENTICATION.md) - **NEW Enterprise Auth Guide**
- **Deployment Help**: See [DEPLOY.md](docs/DEPLOY.md) or [QUICK_START.md](docs/QUICK_START.md)
- **Docker Deployment**: See [DOCKER.md](docs/DOCKER.md)
- **Contributing**: See [CONTRIBUTING.md](docs/CONTRIBUTING.md)
- **Architecture**: See [ARCHITECTURE.md](docs/ARCHITECTURE.md)
- **Code of Conduct**: See [CODE_OF_CONDUCT.md](docs/CODE_OF_CONDUCT.md)
- **Security Policy**: See [SECURITY.md](docs/SECURITY.md)
- **Testing Guidelines**: See [TESTING.md](docs/TESTING.md)
- **Changelog**: See [CHANGELOG.md](docs/CHANGELOG.md)
- **Database Setup**: See [database/DATABASE.md](database/DATABASE.md)
- **OAuth Integration**: See [services/auth/OAUTH_INTEGRATION.md](services/auth/OAUTH_INTEGRATION.md)
- **API Documentation**: See [api/openapi.yaml](api/openapi.yaml)
- **Developer Guide**: See [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md)
- **Release Management**: See [docs/RELEASE_MANAGEMENT.md](docs/RELEASE_MANAGEMENT.md)
- **Incident Response**: See [docs/INCIDENT_RESPONSE.md](docs/INCIDENT_RESPONSE.md)
- **SOC 2 Compliance**: See [docs/SOC2_COMPLIANCE.md](docs/SOC2_COMPLIANCE.md)

## 📋 Compliance & Governance

ARES supports enterprise compliance requirements:

- **SOC 2 Type II**: Comprehensive audit logging and access controls
- **ISO 27001**: Information security management alignment
- **GDPR**: Data privacy and user rights (with proper configuration)
- **OWASP**: Aligned with OWASP Top 10 and OWASP LLM Top 10
- **MITRE**: Full ATLAS and ATT&CK framework coverage

**Enterprise Features:**
- ✅ **Automated Testing**: 35+ unit, integration, security, and E2E tests
- ✅ **API Hardening**: Rate limiting, validation, sanitization, CORS, CSRF
- ✅ **Database Ready**: PostgreSQL schema with multi-tenant support
- ✅ **OAuth Integration**: Auth0, Azure AD, Okta ready for production
- ✅ **Audit Trail**: Complete compliance logging
- ✅ **Incident Response**: Documented security procedures
- ✅ **Release Management**: Semantic versioning with CI/CD
- ✅ **Developer Docs**: Comprehensive onboarding and guides

**Documentation:**
- [DATA_HANDLING.md](docs/DATA_HANDLING.md) - Data lifecycle and privacy policies
- [RESPONSIBLE_USE.md](docs/RESPONSIBLE_USE.md) - Ethical use guidelines
- [THREAT_MODEL.md](docs/THREAT_MODEL.md) - Security threat analysis
- [ROADMAP.md](docs/ROADMAP.md) - Product roadmap and future plans
- [SOC2_COMPLIANCE.md](docs/SOC2_COMPLIANCE.md) - SOC 2 compliance framework
- [INCIDENT_RESPONSE.md](docs/INCIDENT_RESPONSE.md) - Incident handling procedures


---

**Built with ❤️ for the AI Security Community**

*ARES Dashboard v0.9.0 - Enterprise Trust & Governance Release*

**Enterprise-Ready Features:**
- 📋 Comprehensive security and compliance documentation
- 🔒 Threat modeling and security controls
- 📊 Audit logging for SOC 2 / ISO 27001 compliance  
- 🛡️ OAuth integration path for production deployments
- 📦 Docker and self-hosted deployment support
- 🔍 Extensive testing framework and guidelines

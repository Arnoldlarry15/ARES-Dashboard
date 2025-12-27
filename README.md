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
- 🔐 **RBAC Authentication**: 4 user roles (Admin, Red Team Lead, Analyst, Viewer)
- 👥 **Team Workspaces**: Collaborative red team operations with member management
- 🤝 **Campaign Sharing**: Granular permissions (view, edit, delete, reshare)
- 📊 **Audit Logging**: Comprehensive activity tracking for compliance (SOC2, ISO 27001, GDPR)
- 🔒 **Session Management**: JWT-style tokens with 24-hour expiration
- 📝 **Activity Feed**: Real-time monitoring of all team actions

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
4. (Optional) Add `GEMINI_API_KEY` environment variable for AI-powered payloads
5. Click "Deploy"

**Important**: The API key is now secured in the backend. Use `GEMINI_API_KEY` (not `VITE_GEMINI_API_KEY`).

For detailed deployment instructions, see [DEPLOY.md](DEPLOY.md) or [QUICK_START.md](QUICK_START.md)

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

3. (Optional) Set up Gemini API key for local development:
   - Copy `.env.example` to `.env.local`
   - Add your API key:
   ```bash
   GEMINI_API_KEY=your_actual_api_key_here
   ```
   - Get your API key from: https://aistudio.google.com/apikey
   - **Note**: For local development with API, use `vercel dev` instead of `npm run dev`

4. Start the development server:
```bash
# Without API key (uses mock data)
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

#### Mock Mode (No API Key)
Works perfectly without an API key using realistic mock data:
- All frameworks and tactics available
- Pre-configured attack vectors and payloads
- Full campaign management and team features
- Ideal for testing and demonstration

#### AI Mode (With API Key)
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
│   └── tsconfig.json           # API TypeScript config
├── components/
│   ├── AuthLogin.tsx           # Authentication UI
│   ├── TeamManagement.tsx      # Team workspace management
│   └── PayloadEditor.tsx       # In-line payload editor
├── services/
│   ├── geminiService.ts        # AI integration service (calls backend)
│   ├── authService.ts          # Authentication & RBAC
│   └── workspaceService.ts     # Team collaboration
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
├── CONTRIBUTING.md             # Contribution guidelines
├── CODE_OF_CONDUCT.md          # Community standards
├── ARCHITECTURE.md             # Technical architecture overview
├── DEPLOY.md                   # Deployment guide
├── QUICK_START.md              # Quick deployment reference
├── BACKEND_MIGRATION.md        # Backend migration guide
└── package.json                # Dependencies and scripts
```

## 🎯 User Roles & Permissions

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

## Security Note

This tool is designed for **authorized security testing only**. The payloads and techniques demonstrated are for educational and authorized penetration testing purposes. Always:
- Obtain proper authorization before testing
- Use in controlled environments
- Follow responsible disclosure practices
- Comply with applicable laws and regulations

## 🧪 Testing

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

## 🔄 CI/CD & Automation

**Continuous Integration:**
- Automated builds on all PRs and pushes to main
- ESLint code quality checks
- TypeScript type checking
- Production build verification

**Security Automation:**
- CodeQL security scanning on all PRs
- Dependabot weekly dependency updates
- Automated vulnerability detection

**Quality Gates:**
All PRs must pass:
- ✅ Lint checks (`npm run lint`)
- ✅ Type checks (`npm run typecheck`)
- ✅ Build verification (`npm run build`)
- ✅ CodeQL security scan

## 📊 Performance

- **Build Size**: ~330 KB (gzipped: ~96 KB)
- **First Load**: < 1s on modern browsers
- **Time to Interactive**: < 2s
- **Lighthouse Score**: 95+

## 🔒 Security

- **Zero Vulnerabilities**: Passed npm audit with 0 vulnerabilities
- **Automated Security Scanning**: CodeQL analysis runs on all PRs and pushes to main
- **Dependency Management**: Dependabot weekly updates for npm packages
- **Secure API Keys**: Gemini API key protected on backend, never exposed to client
- **Serverless Architecture**: API calls routed through secure backend functions
- **Security Headers**: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection
- **Authentication**: Demo RBAC system (integrate with your auth provider)
- **Audit Logging**: Comprehensive activity tracking for compliance
- **Session Management**: 24-hour JWT-style tokens with device tracking
- **Threat Model**: Comprehensive threat analysis and mitigation strategies
- **Security Policy**: Documented vulnerability reporting and response procedures

**📋 Enterprise Trust Artifacts:**
- [SECURITY.md](SECURITY.md) - Security policy and vulnerability reporting
- [THREAT_MODEL.md](THREAT_MODEL.md) - Comprehensive threat modeling and risk assessment
- [RESPONSIBLE_USE.md](RESPONSIBLE_USE.md) - Ethical guidelines and responsible use policies
- [DATA_HANDLING.md](DATA_HANDLING.md) - Data lifecycle, privacy, and compliance
- [ROADMAP.md](ROADMAP.md) - Product roadmap and future enhancements

### API Security Architecture

```
Browser (Frontend)
    ↓ POST /api/generate-tactic
Vercel Serverless Function (Backend)
    ↓ Uses GEMINI_API_KEY (secure)
Gemini API (Google)
```

The API key is stored in Vercel environment variables and accessed only by the backend, ensuring it's never exposed to the browser or visible in the JavaScript bundle.

## 📄 License

See [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guidelines](CONTRIBUTING.md) and [Code of Conduct](CODE_OF_CONDUCT.md) before submitting a Pull Request.

**Quick Links:**
- [CONTRIBUTING.md](CONTRIBUTING.md) - Installation, development setup, PR guidelines, CI expectations
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) - Community standards and enforcement
- [ARCHITECTURE.md](ARCHITECTURE.md) - Technical architecture and design decisions

## 🙏 Acknowledgments

- OWASP Foundation for LLM security guidelines
- MITRE Corporation for ATLAS and ATT&CK frameworks
- Google for Gemini AI capabilities
- Vercel for deployment platform

## 📞 Support & Documentation

- **Issues**: Open an issue on GitHub
- **Deployment Help**: See [DEPLOY.md](DEPLOY.md) or [QUICK_START.md](QUICK_START.md)
- **Docker Deployment**: See [DOCKER.md](DOCKER.md)
- **Contributing**: See [CONTRIBUTING.md](CONTRIBUTING.md)
- **Architecture**: See [ARCHITECTURE.md](ARCHITECTURE.md)
- **Code of Conduct**: See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- **Security Policy**: See [SECURITY.md](SECURITY.md)
- **Testing Guidelines**: See [TESTING.md](TESTING.md)
- **Changelog**: See [CHANGELOG.md](CHANGELOG.md)

## 📋 Compliance & Governance

ARES supports enterprise compliance requirements:

- **SOC 2 Type II**: Comprehensive audit logging and access controls
- **ISO 27001**: Information security management alignment
- **GDPR**: Data privacy and user rights (with proper configuration)
- **OWASP**: Aligned with OWASP Top 10 and OWASP LLM Top 10
- **MITRE**: Full ATLAS and ATT&CK framework coverage

**Documentation:**
- [DATA_HANDLING.md](DATA_HANDLING.md) - Data lifecycle and privacy policies
- [RESPONSIBLE_USE.md](RESPONSIBLE_USE.md) - Ethical use guidelines
- [THREAT_MODEL.md](THREAT_MODEL.md) - Security threat analysis
- [ROADMAP.md](ROADMAP.md) - Product roadmap and future plans


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

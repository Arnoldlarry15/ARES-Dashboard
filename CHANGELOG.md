# Changelog

All notable changes to ARES Dashboard will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Placeholder for upcoming features

## [0.9.0] - 2024-12-26

### Added - Enterprise Trust and Governance

#### Documentation
- **SECURITY.md**: Comprehensive security policy with vulnerability reporting procedures
- **THREAT_MODEL.md**: Detailed threat modeling with risk assessment and mitigation strategies
- **RESPONSIBLE_USE.md**: Ethical guidelines and responsible use policies for security testing
- **ROADMAP.md**: Product roadmap with planned features and release timeline
- **DATA_HANDLING.md**: Data lifecycle, privacy, and compliance documentation
- **CHANGELOG.md**: Version history and release notes (this file)

#### Product Positioning
- Clear enterprise positioning: "ARES is an AI red-teaming and governance dashboard designed to help organizations safely evaluate, document, and mitigate LLM risks across the OWASP LLM Top 10 and MITRE ATLAS frameworks"
- Enhanced README with enterprise feature emphasis
- Professional trust artifacts for compliance (SOC2, ISO 27001, GDPR)

#### Security Enhancements
- Documented authentication and authorization architecture
- Server-side authorization enforcement guidelines
- OAuth 2.0/OIDC integration documentation
- Immutable audit log specifications
- Data retention and privacy policy framework

#### Deployment
- Docker deployment documentation (planned)
- Self-hosted deployment guide (planned)
- Environment-based configuration documentation
- Rate limiting recommendations

#### Quality & Testing
- Testing strategy documentation
- Error classification system documentation
- CI/CD pipeline best practices

### Changed
- Updated version from 0.0.0 to 0.9.0 to reflect production-readiness progress
- Enhanced README.md with clearer enterprise messaging
- Improved security documentation structure

### Security
- Documented known security considerations in demo mode
- Established security scanning and monitoring practices
- CodeQL automated security analysis
- Dependabot automated dependency updates

## [0.8.0] - 2024-12 (Previous Release)

### Added
- 4-role RBAC system (Admin, Red Team Lead, Analyst, Viewer)
- Team workspaces with collaborative features
- Campaign sharing with granular permissions
- Comprehensive audit logging for compliance
- Session management with 24-hour expiration
- Activity feed for real-time monitoring

### Enhanced
- Modern UI with glassmorphism effects
- Dark/Light theme toggle
- Keyboard shortcuts for power users
- Payload editor with line numbers
- Progress persistence (24-hour auto-save)
- Bulk selection for vectors and payloads

### Security
- Backend API for secure Gemini integration
- API key protection (never exposed to frontend)
- Security headers (X-Content-Type-Options, X-Frame-Options, X-XSS-Protection)
- Zero npm vulnerabilities

## [0.7.0] - 2024-11

### Added
- MITRE ATLAS framework support
- MITRE ATT&CK framework support
- Multi-framework switching
- Enhanced attack vector selection
- Improved payload customization

### Fixed
- Search performance improvements
- UI responsiveness on mobile devices
- Campaign export reliability

## [0.6.0] - 2024-10

### Added
- Campaign management system
- Save/Load/Delete campaigns
- Campaign metadata tracking
- Search and filter functionality
- Export to JSON

### Enhanced
- UI/UX improvements
- Better error handling
- Loading states
- Toast notifications

## [0.5.0] - 2024-09

### Added
- Google Gemini AI integration
- Dynamic payload generation
- Context-aware attack suggestions
- AI-powered mitigation strategies

### Security
- Moved API key to backend serverless function
- Implemented secure API proxy
- Added request validation

## [0.4.0] - 2024-08

### Added
- OWASP LLM Top 10 framework
- Interactive 3-step workflow
- Tactic selection UI
- Attack vector configuration
- Payload customization

### Enhanced
- Modern React 19 implementation
- TypeScript for type safety
- Vite for fast builds
- Component architecture

## [0.3.0] - 2024-07

### Added
- Initial proof of concept
- Basic attack manifest builder
- JSON export functionality
- Framework definitions

## [0.2.0] - 2024-06

### Added
- Project structure and architecture
- Basic UI components
- Vercel deployment configuration

## [0.1.0] - 2024-05

### Added
- Initial repository setup
- README and basic documentation
- License and contribution guidelines
- Code of conduct

---

## Release Types

- **Major (X.0.0)**: Breaking changes, major features, significant architectural changes
- **Minor (0.X.0)**: New features, non-breaking enhancements, framework additions
- **Patch (0.0.X)**: Bug fixes, security patches, documentation updates

## Version Support

- **Current**: v0.9.x - Full support with security updates
- **Previous**: v0.8.x - Security updates only (until v1.0.0 release)
- **Older**: No longer supported

## Upgrade Guides

### Upgrading to 0.9.0

**For Demo Mode Users**:
- No breaking changes
- All existing campaigns remain compatible
- New documentation provides additional context

**For Production Deployments**:
- Review new security documentation ([SECURITY.md](SECURITY.md))
- Implement recommended security controls
- Configure data retention policies ([DATA_HANDLING.md](DATA_HANDLING.md))
- Review and apply responsible use guidelines ([RESPONSIBLE_USE.md](RESPONSIBLE_USE.md))

**For Contributors**:
- Follow new contribution guidelines
- Review security best practices
- Use new testing documentation

### Environment Variables

New recommended environment variables in 0.9.0:

```bash
# Data Retention
AUDIT_LOG_RETENTION_DAYS=90
CAMPAIGN_RETENTION_DAYS=0
SOFT_DELETE_RECOVERY_DAYS=30

# Privacy Controls
PROMPT_STORAGE=false
LOGGING_ENABLED=false

# Security
SESSION_TIMEOUT_HOURS=24
```

## Breaking Changes

### v0.9.0
- None (documentation and policy updates only)

### Future Breaking Changes (v1.0.0)
- Backend database will become required for production deployments
- OAuth authentication will replace demo mode for production
- LocalStorage-only mode will be deprecated for production use

## Deprecation Notices

### Deprecated in 0.9.0
- None

### Planned Deprecations (v1.0.0)
- Demo mode authentication for production deployments (use OAuth instead)
- LocalStorage-only audit logs for compliance requirements (use backend instead)

## Security Advisories

### v0.9.0
- No known vulnerabilities
- Demo mode limitations documented (frontend-only auth not suitable for production)
- All dependencies audited with zero vulnerabilities

## Previous Security Advisories
- No previous security advisories

## Roadmap Preview

### Next Release: v0.10.0 (Q1 2025)
- OAuth 2.0/OIDC authentication integration
- Server-side authorization enforcement
- Multi-factor authentication (MFA) support
- Enhanced session management

### Future Releases
- v0.11.0: Immutable audit logs and compliance reporting
- v0.12.0: Data privacy and retention management
- v1.0.0: Production maturity with comprehensive testing

See [ROADMAP.md](ROADMAP.md) for complete roadmap.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to contribute to ARES Dashboard.

## Links

- **Homepage**: https://github.com/Arnoldlarry15/ARES-Dashboard
- **Issues**: https://github.com/Arnoldlarry15/ARES-Dashboard/issues
- **Discussions**: https://github.com/Arnoldlarry15/ARES-Dashboard/discussions
- **Security**: [SECURITY.md](SECURITY.md)

---

**Note**: Dates use ISO 8601 format (YYYY-MM-DD). This changelog follows [Keep a Changelog](https://keepachangelog.com/) conventions.

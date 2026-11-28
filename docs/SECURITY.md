# Security Policy

## Overview

ARES Dashboard is committed to maintaining the highest security standards for our AI red-teaming and governance platform. This document outlines our security policies, vulnerability reporting procedures, and security best practices.

## Supported Versions

We provide security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Security Architecture

### Authentication & Authorization
- **Demo Mode**: Frontend-only role-based access control (RBAC) for evaluation
- **Production Mode**: Requires integration with enterprise identity providers (OAuth 2.0/OIDC)
- **Session Management**: JWT-style tokens with 24-hour expiration
- **Role-Based Access**: 4 distinct roles (Admin, Red Team Lead, Analyst, Viewer)

### API Security
- **Backend Protection**: Gemini API key stored in secure backend environment variables
- **Never Client-Side**: API credentials never exposed to browser or JavaScript bundle
- **Serverless Functions**: All AI API calls routed through Vercel serverless functions
- **Rate Limiting**: Configurable rate limits on API endpoints (recommended for production)

### Data Security
- **Local Storage Fallback (Demo Mode)**: When no backend database is configured, demo/local-only mode stores state in browser `localStorage`. `localStorage` is unencrypted, accessible to JavaScript (XSS-sensitive), and not suitable for sensitive data or compliance-grade audit trails.
- **No Default Server Persistence**: No server-side data storage unless PostgreSQL (`DATABASE_URL`) is configured
- **Encryption in Transit**: HTTPS enforced for all production deployments
- **Secure Headers**: `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`, `Content-Security-Policy`, and `Permissions-Policy` configured

### Audit & Compliance
- **Comprehensive Logging**: User and API actions logged with timestamps, `orgId`, and `actorId` context
- **Append-Only Audit Trail (PostgreSQL)**: When backed by PostgreSQL, `audit_logs` is protected by `BEFORE UPDATE OR DELETE` (`audit_logs_immutable`) and `BEFORE TRUNCATE` (`audit_logs_no_truncate`) triggers. Effective runtime immutability requires connecting the application with a **separate non-owner, non-superuser PostgreSQL role** (table owners and superusers can disable triggers).
- **Compliance Support**: Technical controls are designed to support organizational SOC 2, ISO 27001, and GDPR programs (ARES itself does not certify or guarantee compliance)
- **Export Capabilities**: Audit logs exportable in JSON, CSV, and PDF formats

## Reporting a Vulnerability

We take security vulnerabilities seriously and appreciate responsible disclosure.

### How to Report

**DO NOT** open a public GitHub issue for security vulnerabilities.

Instead, please report security vulnerabilities via one of these methods:

1. **GitHub Security Advisories** (Preferred): Use the private vulnerability reporting feature
   - Go to: https://github.com/Arnoldlarry15/ARES-Dashboard/security/advisories/new
   - Create a new security advisory
   - We will respond within 48 hours
2. **Email** (Optional - if configured for your deployment):
   - Subject: "ARES Security Vulnerability Report"
   - Include: Detailed description, reproduction steps, impact assessment

### What to Include

Please provide as much information as possible:

- **Vulnerability Type**: (e.g., XSS, CSRF, Authentication bypass, Information disclosure)
- **Impact**: Severity and potential consequences
- **Affected Component**: Which part of ARES is affected
- **Reproduction Steps**: Detailed steps to reproduce the vulnerability
- **Proof of Concept**: Code or screenshots demonstrating the issue
- **Suggested Fix**: If you have ideas for remediation (optional)
- **Environment**: Browser, OS, deployment method (Vercel, self-hosted, etc.)

### Response Timeline

- **Initial Response**: Within 48 hours of report
- **Status Update / Triage**: Within 7 days
- **Fix Timeline**: Depends on severity
  - Critical: 24-48 hours
  - High: 7 days
  - Medium: 30 days
  - Low: Next regular release
- **Public Disclosure**: After fix is deployed and users have time to update (typically 30 days)

### Scope

**In Scope:**
- Authentication and authorization bypass
- XSS, CSRF, and injection vulnerabilities
- Information disclosure
- API security issues
- Dependency vulnerabilities in production code
- Cryptographic weaknesses
- Session management issues

**Out of Scope:**
- Limitations in local development mode (clearly labeled as requiring OAuth for production)
- Social engineering attacks
- Physical attacks
- DoS attacks requiring significant resources
- Vulnerabilities requiring significant user interaction or unlikely user behavior
- Issues in third-party dependencies (report those to the maintainers)

## Security Best Practices for Users

### For Deployment

1. **Use OAuth 2.0/OIDC**: Integrate with enterprise identity provider (Google, Microsoft Entra, Okta)
2. **Enable HTTPS**: Always deploy with TLS/SSL certificates
3. **Environment Variables**: Store all secrets in secure environment variables, never in code
4. **Rate Limiting**: Implement rate limiting on API endpoints
5. **Regular Updates**: Keep ARES and dependencies up to date
6. **Access Control**: Limit admin access to authorized personnel only
7. **Audit Logs**: Enable and monitor audit logs regularly

### For Development

1. **No API Keys in Code**: Never commit API keys or secrets to version control
2. **Use .env.local**: Store development secrets in `.env.local` (gitignored)
3. **Review Dependencies**: Regularly audit dependencies with `npm audit`
4. **Follow Guidelines**: Adhere to secure coding practices in [CONTRIBUTING.md](./CONTRIBUTING.md)
5. **Test Thoroughly**: Verify security controls before deploying changes

### For Red Team Operations

1. **Authorization Required**: Only use ARES with proper authorization for testing
2. **Controlled Environments**: Conduct tests in isolated, controlled environments
3. **Data Handling**: Follow data handling policies (see DATA_HANDLING.md)
4. **Responsible Disclosure**: Report discovered vulnerabilities responsibly
5. **Audit Trail**: Maintain detailed audit logs of all testing activities

## Known Security Considerations

### Current Limitations (Demo Mode)

- **Frontend-Only Auth**: Demo mode authentication is client-side only
  - **NOT SUITABLE FOR PRODUCTION** without backend integration
  - Roles can be bypassed with browser dev tools
  - Use only for evaluation and testing

- **LocalStorage Security**: Data stored in browser localStorage
  - Accessible via JavaScript
  - Not encrypted at rest
  - Cleared when browser storage is cleared
  - Subject to XSS if vulnerability exists

### Recommended Production Setup

For production use, integrate with:

1. **Identity Providers**: OAuth 2.0/OIDC (Google, Microsoft Entra, Okta, Auth0)
2. **Backend Authorization**: Server-side role validation on every API request
3. **Secure Session Store**: Redis, database, or secure cookie storage
4. **Audit Log Database**: PostgreSQL, MySQL, or compliance-grade logging service
5. **Rate Limiting**: API gateway or application-level rate limiting
6. **WAF**: Web Application Firewall for production deployments

## Security Scanning & Monitoring

### Automated Security

- **CodeQL**: Automated security analysis on all PRs and pushes to main
- **Dependabot**: Weekly automated dependency updates
- **npm audit**: Run `npm audit` regularly in CI and local development to detect known dependency vulnerabilities
- **GitHub Advanced Security**: Enabled for vulnerability scanning

### Manual Security Reviews

- Code reviews required for all PRs
- Security-focused reviews for authentication and authorization changes
- Periodic penetration testing recommended for production deployments

## Compliance & Certifications

### Framework Support

ARES is designed to support compliance with:

- **SOC 2 Type II**: Activity logging and access controls
- **ISO 27001**: Information security management
- **GDPR**: Data privacy and user rights (with proper configuration)
- **HIPAA**: Can be configured for healthcare data (requires additional controls)
- **OWASP**: Aligned with OWASP Top 10 and OWASP LLM Top 10

### Audit Capabilities

- Append-only PostgreSQL audit logs with timestamps (enforced via `BEFORE UPDATE OR DELETE` and `BEFORE TRUNCATE` triggers when using a non-owner runtime DB role; demo `localStorage` fallback is not tamper-evident)
- User action tracking (`actorId`, `orgId`)
- Campaign and payload versioning
- Export capabilities (JSON, CSV, PDF)
- Configurable retention policies

## Security Roadmap

### Planned Enhancements

- **v0.9.x**: Enhanced audit log encryption and signing
- **v0.10.x**: Multi-factor authentication (MFA) support
- **v0.11.x**: Advanced threat detection and anomaly detection
- **v1.0.x**: Enterprise SSO integration improvements
- **Future**: SOC 2 Type II certification, penetration testing reports

## Additional Resources

### Enterprise Trust Documentation
- **Trust Boundaries**: See [TRUST_BOUNDARY.md](TRUST_BOUNDARY.md) - What ARES defends against and does NOT defend against
- **Security Boundaries**: See [SECURITY_BOUNDARIES.md](SECURITY_BOUNDARIES.md) - Who should use ARES and misuse prevention
- **AI Behavior**: See [AI_BEHAVIOR.md](AI_BEHAVIOR.md) - Determinism and reproducibility guarantees
- **Version Guarantees**: See [VERSION_GUARANTEES.md](VERSION_GUARANTEES.md) - Behavioral stability promises
- **Product Positioning**: See [PRODUCT_POSITIONING.md](PRODUCT_POSITIONING.md) - What ARES is and isn't

### Security & Operations
- **Architecture**: See [ARCHITECTURE.md](./ARCHITECTURE.md) for technical design
- **Data Handling**: See [DATA_HANDLING.md](DATA_HANDLING.md) for data policies
- **Responsible Use**: See [RESPONSIBLE_USE.md](RESPONSIBLE_USE.md) for ethical guidelines
- **Threat Model**: See [THREAT_MODEL.md](THREAT_MODEL.md) for risk assessment
- **Contributing**: See [CONTRIBUTING.md](./CONTRIBUTING.md) for secure development practices

## Contact

For security-related questions:
- **Security Issues**: Use GitHub Security Advisories or email security contact
- **General Questions**: Open a GitHub Discussion
- **Compliance Questions**: Contact via repository discussions

---

**Last Updated**: December 2024  
**Version**: 1.0.0

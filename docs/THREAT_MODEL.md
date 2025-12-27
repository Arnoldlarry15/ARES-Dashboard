# ARES Dashboard Threat Model

## Overview

This document provides a comprehensive threat model for ARES (AI Red-teaming & Evaluation System) Dashboard. It identifies potential security threats, attack vectors, and mitigation strategies to help organizations understand and manage security risks when deploying ARES.

## Executive Summary

ARES Dashboard is an AI red-teaming and governance platform that helps organizations safely evaluate, document, and mitigate LLM risks. As a security tool that generates attack payloads and stores sensitive testing data, ARES itself must be hardened against attacks.

**Risk Level by Deployment Mode:**
- **Demo Mode**: Low to Medium risk (evaluation only, no sensitive data)
- **Production Mode**: Medium to High risk (requires enterprise security controls)

## System Overview

### Architecture Components

```
┌─────────────────────────────────────────────────────────┐
│                    End User Browser                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │   React UI   │  │ LocalStorage │  │  Auth State  │ │
│  └──────────────┘  └──────────────┘  └──────────────┘ │
└───────────────────────────┬─────────────────────────────┘
                            │ HTTPS
                            │
┌───────────────────────────▼─────────────────────────────┐
│              Vercel Edge Network / CDN                   │
└───────────────────────────┬─────────────────────────────┘
                            │
        ┌───────────────────┴───────────────────┐
        │                                       │
┌───────▼────────┐                    ┌────────▼─────────┐
│  Static Assets  │                    │ Serverless APIs  │
│  (Vite Build)   │                    │  /api/*          │
└─────────────────┘                    └────────┬─────────┘
                                                 │
                                       ┌─────────▼──────────┐
                                       │  External APIs     │
                                       │  (Gemini AI)       │
                                       └────────────────────┘
```

### Data Flow

1. **User Authentication**: Browser → Frontend Auth → LocalStorage (demo mode)
2. **Campaign Creation**: Browser → LocalStorage → Export JSON
3. **AI Payload Generation**: Browser → Serverless API → Gemini API → Browser
4. **Audit Logging**: Browser → LocalStorage (demo mode)

## Trust Boundaries

### Boundary 1: User Browser ↔ Vercel Platform
- **Trust Level**: Untrusted to Trusted
- **Protection**: HTTPS, CSP, CORS, Security Headers

### Boundary 2: Vercel Platform ↔ External APIs
- **Trust Level**: Trusted to Semi-Trusted
- **Protection**: API keys, rate limiting, request validation

### Boundary 3: User ↔ Application
- **Trust Level**: Untrusted to Partially Trusted
- **Protection**: Authentication, authorization, input validation

## Threat Catalog

### T1: Authentication & Authorization Threats

#### T1.1: Frontend Auth Bypass (Demo Mode)
- **Severity**: Medium (Demo), Critical (Production)
- **Description**: In demo mode, authentication is client-side only and can be bypassed via browser dev tools
- **Attack Vector**: 
  - Open browser dev tools
  - Modify localStorage to change user role
  - Gain unauthorized access to admin functions
- **Impact**: Unauthorized access to admin features, data modification
- **Mitigation**:
  - **Demo Mode**: Clearly label as not production-ready, use only for evaluation
  - **Production Mode**: Implement server-side authentication with OAuth 2.0/OIDC
  - **Required**: Backend API must validate user roles on every request
- **Status**: Known limitation (demo), mitigated in production setup

#### T1.2: Session Hijacking
- **Severity**: High
- **Description**: Session tokens stored in localStorage vulnerable to XSS attacks
- **Attack Vector**:
  - Exploit XSS vulnerability to steal session token
  - Replay token to impersonate user
- **Impact**: Account takeover, unauthorized operations
- **Mitigation**:
  - Use HttpOnly, Secure, SameSite cookies instead of localStorage (production)
  - Implement short-lived access tokens with refresh tokens
  - Add CSRF tokens for state-changing operations
  - Regular security scanning for XSS vulnerabilities
- **Status**: Partially mitigated (secure headers, CSP)

#### T1.3: Privilege Escalation
- **Severity**: High
- **Description**: User with lower privileges gains unauthorized higher-level access
- **Attack Vector**:
  - Bypass frontend validation
  - Direct API calls with elevated role claims
- **Impact**: Unauthorized administrative actions, data access
- **Mitigation**:
  - Server-side role validation on every API endpoint
  - Backend API must ensure user roles are verified on every request
  - Audit logging of all privilege checks
  - Principle of least privilege enforcement
  - Regular access reviews
- **Status**: Requires backend implementation

### T2: Data Security Threats

#### T2.1: Sensitive Data in LocalStorage
- **Severity**: Medium
- **Description**: Campaign data, attack payloads, and audit logs stored in unencrypted browser storage
- **Attack Vector**:
  - XSS attack to exfiltrate localStorage data
  - Physical access to unlocked device
  - Malicious browser extension
- **Impact**: Exposure of red team strategies, attack payloads, target information
- **Mitigation**:
  - Encrypt sensitive data before storing in localStorage
  - Clear sensitive data after session expiration
  - Implement automatic logout on inactivity
  - Use backend storage for production deployments
- **Status**: Partially mitigated (session expiration)

#### T2.2: API Key Exposure
- **Severity**: Critical
- **Description**: Gemini API key could be exposed if misconfigured
- **Attack Vector**:
  - Hardcoded API key in frontend code
  - API key in git history
  - Environment variable leak
- **Impact**: Unauthorized API usage, cost implications, quota exhaustion
- **Mitigation**:
  - ✅ API key stored only in backend environment variables
  - ✅ Never expose API key to frontend
  - ✅ Serverless functions proxy all AI API calls
  - Git secrets scanning enabled
  - Regular API key rotation
- **Status**: Mitigated (backend-only API key access)

#### T2.3: Data Exfiltration via Export
- **Severity**: Medium
- **Description**: Unauthorized users could export sensitive campaign data
- **Attack Vector**:
  - Bypass frontend role checks
  - Export campaigns containing sensitive information
- **Impact**: Intellectual property theft, strategy disclosure
- **Mitigation**:
  - Backend validation for export permissions
  - Audit logging of all export operations
  - Rate limiting on export endpoints
  - Watermarking exported data with user info
- **Status**: Requires backend implementation

### T3: Injection & Input Validation Threats

#### T3.1: Cross-Site Scripting (XSS)
- **Severity**: High
- **Description**: Malicious scripts injected via user input (payload text, campaign names)
- **Attack Vector**:
  - Inject JavaScript in campaign name field
  - Script executes when other users view the campaign
  - Steal session tokens, perform unauthorized actions
- **Impact**: Session hijacking, data theft, account compromise
- **Mitigation**:
  - ✅ React default XSS protection (automatic escaping)
  - Input sanitization on all user-controlled fields
  - Content Security Policy (CSP) headers
  - Regular security scanning (CodeQL)
  - Avoid dangerouslySetInnerHTML
- **Status**: Partially mitigated (React, CSP)

#### T3.2: Prompt Injection (AI Payloads)
- **Severity**: Medium
- **Description**: Crafted prompts could manipulate AI to generate unintended outputs
- **Attack Vector**:
  - Input specially crafted tactic descriptions
  - Bypass AI safety controls
  - Generate harmful content beyond intended scope
- **Impact**: Inappropriate content generation, AI service abuse
- **Mitigation**:
  - Input validation on tactic parameters
  - AI output validation and filtering
  - Rate limiting on AI generation requests
  - Content safety filters
  - User accountability via audit logs
- **Status**: Partially mitigated (rate limiting recommended)

#### T3.3: SQL Injection (Future Backend)
- **Severity**: High (when backend database implemented)
- **Description**: If backend database added, SQL injection could occur
- **Attack Vector**:
  - Inject SQL commands via search, filter, or input fields
  - Execute arbitrary database queries
- **Impact**: Data breach, data modification, authentication bypass
- **Mitigation**:
  - Use parameterized queries / prepared statements
  - ORM with built-in SQL injection protection
  - Input validation and sanitization
  - Principle of least privilege for database users
  - Regular security testing
- **Status**: Not applicable (no backend database yet)

### T4: Availability & Abuse Threats

#### T4.1: API Rate Limiting / DoS
- **Severity**: Medium
- **Description**: Excessive API calls to AI service or serverless functions
- **Attack Vector**:
  - Automated scripts making thousands of payload generation requests
  - Exhaust API quota or serverless function limits
- **Impact**: Service unavailability, unexpected costs, degraded performance
- **Mitigation**:
  - Implement rate limiting per user/IP
  - API quota monitoring and alerts
  - Circuit breaker patterns
  - Queue-based processing for bulk operations
  - Cost caps on cloud providers
- **Status**: Requires implementation

#### T4.2: Resource Exhaustion (Client-Side)
- **Severity**: Low
- **Description**: Extremely large campaigns or payloads crash browser
- **Attack Vector**:
  - Create campaign with thousands of payloads
  - Malicious user causes DoS for other users sharing device
- **Impact**: Browser crash, data loss, poor user experience
- **Mitigation**:
  - Pagination for large datasets
  - Lazy loading of campaign data
  - Client-side limits on campaign size
  - Warning messages for large operations
- **Status**: Partially mitigated (UX design)

### T5: Supply Chain & Dependency Threats

#### T5.1: Malicious Dependencies
- **Severity**: High
- **Description**: Compromised npm packages introduce vulnerabilities
- **Attack Vector**:
  - Dependency with malicious code
  - Typosquatting attack
  - Compromised maintainer account
- **Impact**: Code execution, data theft, backdoor installation
- **Mitigation**:
  - ✅ Dependabot automated updates
  - ✅ npm audit regularly run
  - Package lock files for reproducible builds
  - Review dependency changes in PRs
  - Use trusted, well-maintained packages
  - Consider npm package provenance
- **Status**: Mitigated (automated scanning)

#### T5.2: Vulnerable Dependencies
- **Severity**: Medium to Critical (depends on vulnerability)
- **Description**: Known CVEs in dependencies
- **Attack Vector**:
  - Exploit known vulnerability in dependency
  - Achieve RCE, XSS, or other attacks
- **Impact**: Varies by vulnerability
- **Mitigation**:
  - ✅ npm audit with zero vulnerabilities target
  - ✅ Automated Dependabot security updates
  - ✅ CodeQL scanning for vulnerable patterns
  - Regular dependency updates
  - Monitor security advisories
- **Status**: Actively managed (automated tools)

### T6: Operational & Deployment Threats

#### T6.1: Misconfigured Deployment
- **Severity**: High
- **Description**: Production deployment with insecure configuration
- **Attack Vector**:
  - HTTPS not enforced
  - CORS misconfiguration
  - Exposed debug endpoints
  - Default credentials
- **Impact**: Data interception, unauthorized access, information disclosure
- **Mitigation**:
  - ✅ Security headers enforced (vercel.json)
  - Infrastructure-as-code (IaC) for consistent deployments
  - Pre-deployment security checklist
  - Automated configuration validation
  - Separate dev/staging/prod environments
- **Status**: Partially mitigated (Vercel defaults)

#### T6.2: Insufficient Monitoring & Alerting
- **Severity**: Medium
- **Description**: Security incidents not detected or responded to promptly
- **Attack Vector**:
  - Attacker operates undetected
  - Prolonged unauthorized access
- **Impact**: Extended damage, data exfiltration, compliance violations
- **Mitigation**:
  - Implement security monitoring (SIEM)
  - Real-time alerting for suspicious activities
  - Regular audit log reviews
  - Incident response plan
  - Automated anomaly detection
- **Status**: Requires implementation

### T7: Compliance & Legal Threats

#### T7.1: Data Privacy Violations
- **Severity**: High
- **Description**: Failure to comply with GDPR, CCPA, or other privacy regulations
- **Attack Vector**:
  - Storing personal data without consent
  - Inadequate data retention policies
  - No data deletion mechanism
- **Impact**: Legal penalties, reputational damage, user distrust
- **Mitigation**:
  - Document data handling practices (DATA_HANDLING.md)
  - Implement configurable data retention
  - Provide data export and deletion capabilities
  - Privacy policy and terms of service
  - Regular compliance audits
- **Status**: Documentation provided

#### T7.2: Audit Log Tampering
- **Severity**: High
- **Description**: Audit logs modified to hide malicious activity
- **Attack Vector**:
  - Direct modification of localStorage audit logs
  - Privileged user deletes incriminating logs
- **Impact**: Loss of audit trail, compliance violations, inability to investigate incidents
- **Mitigation**:
  - Immutable audit log backend storage
  - Cryptographic signing of audit entries
  - Write-only audit log permissions
  - Separate audit log storage from application data
  - Regular integrity checks
- **Status**: Requires backend implementation

## Threat Scenarios

### Scenario 1: Insider Threat
**Attacker**: Malicious employee with Analyst role  
**Goal**: Export all red team campaigns to competitor  
**Attack Path**:
1. Authenticate as legitimate Analyst
2. Browse all accessible campaigns
3. Export campaigns one by one (frontend allows this)
4. Exfiltrate data externally

**Mitigations**:
- Backend validation of export permissions
- Rate limiting on exports
- Audit logging of export operations (already done)
- Data loss prevention (DLP) controls
- User behavior analytics

### Scenario 2: External Attacker
**Attacker**: External threat actor  
**Goal**: Gain access to attack payloads and strategies  
**Attack Path**:
1. Find XSS vulnerability in ARES
2. Inject malicious script in campaign name
3. Steal session tokens when admin user views campaign
4. Use stolen tokens to access all campaigns
5. Export and exfiltrate data

**Mitigations**:
- XSS prevention (React defaults, CSP, input sanitization)
- HttpOnly cookies for sessions (production)
- Short-lived sessions with re-authentication
- Multi-factor authentication (MFA)
- Intrusion detection system (IDS)

### Scenario 3: Supply Chain Attack
**Attacker**: Compromised npm package maintainer  
**Goal**: Inject backdoor into ARES  
**Attack Path**:
1. Compromise popular npm package used by ARES
2. Inject malicious code in update
3. Developers install update via Dependabot
4. Backdoor exfiltrates API keys and session data

**Mitigations**:
- ✅ Lock file verification
- ✅ Automated security scanning (npm audit, CodeQL)
- Code review for dependency updates
- Package provenance verification
- Subresource integrity (SRI) for CDN assets
- Regular security audits

## Risk Assessment Matrix

| Threat ID | Likelihood | Impact | Risk Level | Priority |
|-----------|------------|--------|------------|----------|
| T1.1 | High (Demo) | Medium | High | P0 (Production) |
| T1.2 | Medium | High | High | P1 |
| T1.3 | Medium | High | High | P1 |
| T2.1 | Medium | Medium | Medium | P2 |
| T2.2 | Low | Critical | Medium | P1 (Mitigated) |
| T2.3 | Medium | Medium | Medium | P2 |
| T3.1 | Low | High | Medium | P2 |
| T3.2 | Low | Medium | Low | P3 |
| T4.1 | Medium | Medium | Medium | P2 |
| T4.2 | Low | Low | Low | P3 |
| T5.1 | Low | High | Medium | P2 (Mitigated) |
| T5.2 | Low | Varies | Medium | P2 (Mitigated) |
| T6.1 | Medium | High | High | P1 |
| T6.2 | High | Medium | High | P1 |
| T7.1 | Low | High | Medium | P2 |
| T7.2 | Medium | High | High | P1 |

## Security Recommendations by Deployment Phase

### Phase 1: Evaluation (Demo Mode)
- ✅ Use demo mode authentication (client-side)
- ✅ Store non-sensitive data only
- ✅ Clear labeling as not production-ready
- Understand frontend-only limitations

### Phase 2: Pilot (Small Team)
- Implement OAuth 2.0 authentication
- Add backend session management
- Enable audit log backend storage
- Implement role-based API authorization
- Configure rate limiting

### Phase 3: Production (Enterprise)
- Full OAuth/OIDC integration (Google, Microsoft, Okta)
- Backend database for audit logs and campaigns
- Multi-factor authentication (MFA)
- Security monitoring and alerting
- Regular penetration testing
- Compliance documentation (SOC 2, ISO 27001)
- Data encryption at rest and in transit
- Incident response plan

## Monitoring & Detection

### Security Metrics to Monitor

1. **Authentication Metrics**
   - Failed login attempts
   - Session duration anomalies
   - Geographic access patterns
   - Privilege escalation attempts

2. **API Metrics**
   - Request rate per user
   - API error rates
   - Unusual endpoint access patterns
   - Payload size anomalies

3. **Data Access Metrics**
   - Campaign export frequency
   - Data access volume
   - After-hours access
   - Bulk operations

4. **System Health**
   - Error rates
   - Response times
   - Resource utilization
   - Dependency vulnerabilities

### Alerting Thresholds

- **Critical**: Authentication bypass attempts, API key exposure, SQL injection attempts
- **High**: Multiple failed logins, unusual data exports, privilege escalation attempts
- **Medium**: Rate limit violations, suspicious API patterns, dependency vulnerabilities
- **Low**: Informational security events, access from new locations

## Incident Response

### Incident Classification

1. **P0 - Critical**: Data breach, authentication bypass, RCE
2. **P1 - High**: Account compromise, XSS exploitation, DoS
3. **P2 - Medium**: Suspicious activity, policy violations
4. **P3 - Low**: Security misconfigurations, minor issues

### Response Procedures

1. **Detection**: Automated alerts or user reports
2. **Containment**: Isolate affected systems, revoke compromised sessions
3. **Investigation**: Analyze audit logs, determine root cause
4. **Remediation**: Patch vulnerabilities, update credentials
5. **Recovery**: Restore services, verify integrity
6. **Post-Incident**: Document lessons learned, update threat model

## Conclusion

ARES Dashboard is designed with security as a priority, but like any security tool, it must be deployed thoughtfully. The demo mode is suitable for evaluation only, while production deployments require integration with enterprise security controls.

**Key Takeaways:**
- Demo mode has known limitations (frontend-only auth)
- Production requires OAuth, backend auth, and audit log storage
- Multiple layers of defense are essential
- Regular security reviews and updates are critical
- Compliance and audit capabilities are built-in

## Related Documentation

- [SECURITY.md](SECURITY.md) - Security policy and vulnerability reporting
- [DATA_HANDLING.md](DATA_HANDLING.md) - Data lifecycle and privacy
- [RESPONSIBLE_USE.md](RESPONSIBLE_USE.md) - Ethical use guidelines
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Technical architecture

---

**Last Updated**: December 2024  
**Version**: 0.9.0  
**Next Review**: March 2025

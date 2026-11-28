# Data Handling Policy

## Overview

This document describes how ARES Dashboard handles, stores, processes, and protects data. Understanding ARES's data handling practices is essential for compliance with privacy regulations and maintaining data security.

## Executive Summary

**Key Points:**
- **Primary Persistence**: ARES stores campaigns, users, organizations, generation jobs, and immutable audit logs in **PostgreSQL via Prisma ORM** (`prisma/schema.prisma`)
- **Offline / Demo Fallback**: Browser `localStorage` is used only for UI preferences and offline/demo fallback when backend persistence is unavailable
- **Server-Side Secrets**: API keys and secrets are stored **only in backend environment variables** (never exposed to the browser)
- **Authentication**: Production deployments use **Auth0** (OAuth2/OIDC); SAML 2.0 is disabled in this release (`501 Not Implemented`)
- **No training on customer data** - ARES never uses your data to train models
- **Privacy by design** - minimal data collection and strong default settings

## Data Classification

ARES handles several types of data with different sensitivity levels:

### 1. Campaign Data
**Sensitivity**: Confidential  
**Contains**: Attack manifests, tactics, vectors, payloads, target information  
**Storage**: PostgreSQL (`campaigns` table via Prisma) or browser `localStorage` (offline/demo fallback)  
**Retention**: User-controlled (persisted until deleted via `/api/campaigns` or cleared in fallback mode)

### 2. User Data
**Sensitivity**: Confidential  
**Contains**: Email, name, role, `orgId`, `auth0Sub`, `disabledAt`  
**Storage**: PostgreSQL (`users` table) + Auth0 (when configured)  
**Retention**: 1-hour `HttpOnly` cookie session (plus SPA in-memory renewal); user records soft-deleted via `users.disabledAt`

### 3. Audit Logs
**Sensitivity**: Confidential  
**Contains**: `orgId`, `actorId`, `action`, `target`, `details`, `ipAddress`, `userAgent`, `timestamp`  
**Storage**: PostgreSQL (`audit_logs` table, append-only via database triggers) or browser `localStorage` (demo fallback)  
**Retention**: Append-only in PostgreSQL (database triggers block `UPDATE`, `DELETE`, and `TRUNCATE`; archive/export per organizational policy)

### 4. System Metadata
**Sensitivity**: Internal  
**Contains**: Theme preferences, UI state, last access times  
**Storage**: Browser `localStorage`  
**Retention**: Indefinite until user clears

### 5. AI Prompts and Responses
**Sensitivity**: Confidential  
**Contains**: Tactic descriptions sent to AI, generated payloads  
**Storage**: Temporary during synchronous `/api/generate-tactic` calls, or persisted in `generation_jobs`, `candidate_attempts`, `global_prompt_registry`, and `customer_prompt_vault` when using persistent generation jobs  
**Retention**: Persisted per job/vault lifecycle or until deleted

## Data Storage by Deployment Mode

### Offline / Demo Fallback Mode

**Storage Location**: Browser `localStorage` only

**What's Stored Locally**:
- UI preferences (theme, shortcuts)
- Progress state (current campaign)
- Demo campaigns and fallback activity data when backend APIs are unavailable

**What's NOT Stored**:
- Nothing persists on servers in offline/demo fallback mode
- No database writes
- No centralized audit logs

**Data Persistence**:
- Data persists until browser `localStorage` is cleared
- Users can delete campaigns manually
- Clearing browser data removes local fallback data

**Security Characteristics**:
- Data isolated per browser/device
- Vulnerable to XSS attacks (if a vulnerability exists)
- No encryption at rest in `localStorage`
- Subject to browser storage limits (~5-10MB)

### Production Mode (PostgreSQL + Prisma)

**Storage Location**: PostgreSQL database + Auth0 (OAuth2/OIDC)

**What's Stored on Backend**:
- User profiles, roles, and organization memberships (`users`, `organizations`, `organization_invitations`)
- Campaigns and attack manifests (`campaigns`)
- Audit logs (`audit_logs` — immutable, append-only via PostgreSQL triggers)
- Generation jobs, credit ledger, and prompt vault (`generation_jobs`, `candidate_attempts`, `user_credit_balances`, `credit_transactions`, `global_prompt_registry`, `customer_prompt_vault`)

**What's NOT Stored**:
- Plain-text passwords (Auth0 OAuth2/OIDC authentication)
- API keys in database (backend environment variables only)
- AI training data

**Data Persistence**:
- Durable PostgreSQL persistence managed via Prisma migrations (`npx prisma migrate deploy`)
- User offboarding via `DELETE /api/users` soft-delete (`users.disabledAt`), which preserves `audit_logs` integrity, revokes pending invitations, and cancels active generation jobs (releasing reserved credits)
- Note: Automatic time-based expiration, automated 30-day purge, and legal hold workflows are **not** implemented in the application

**Security Characteristics**:
- Encryption at rest and key management (KMS) provided by your **PostgreSQL hosting provider / cloud infrastructure** (not implemented inside ARES application code)
- Encryption in transit (TLS 1.2+ / HTTPS)
- Application-level `orgId` tenant isolation and server-side RBAC
- Append-only audit logging (`audit_logs_immutable` and `audit_logs_no_truncate` triggers when running with a non-owner, non-superuser DB role)
- Infrastructure-level backup and disaster recovery

## Data Flow

### Campaign Creation Flow

```
User Input (Browser)
    ↓
Client-Side Validation
    ↓
[Demo Mode]                           [Production Mode]
    ↓                                      ↓
Browser localStorage                  Backend API
                                           ↓
                                      Authorization Check
                                           ↓
                                      Database Storage
                                           ↓
                                      Audit Log Entry
```

### AI Payload Generation Flow

```
User Request (Browser)
    ↓
Frontend Service
    ↓
HTTPS POST /api/generate-tactic
    ↓
Vercel Serverless Function (Backend)
    ↓
Authorization & Rate Limiting
    ↓
Gemini API Call (with backend API key)
    ↓
Response Processing & Validation
    ↓
Return to Browser (ephemeral)
    ↓
[User chooses to save]
    ↓
Campaign Storage (localStorage or database)
```

**Important**: AI prompts and responses are **not logged or stored** unless explicitly saved to a campaign.

### Audit Logging Flow

```
User Action (Browser)
    ↓
Action Handler
    ↓
Audit Service
    ↓
Create Audit Entry (timestamp, user, action, resource)
    ↓
[Demo Mode]                           [Production Mode]
    ↓                                      ↓
Browser localStorage                  Backend Audit Database
    ↓                                      ↓
Temporary storage                     Immutable append-only log
                                           ↓
                                      DB triggers block UPDATE/DELETE/TRUNCATE
```

## Data Retention & Deletion

### Retention Behavior

| Data Type | Storage | Deletion / Lifecycle Behavior |
|-----------|---------|-------------------------------|
| Campaigns | PostgreSQL (`campaigns`) | User/admin-controlled; deleted immediately via `DELETE /api/campaigns` |
| Audit Logs | PostgreSQL (`audit_logs`) | Append-only; database triggers block `UPDATE`, `DELETE`, and `TRUNCATE` |
| User Sessions | `HttpOnly` cookie / SPA memory | 1-hour JWT cookie expiration (`JWT_SECRET`) |
| User Accounts | PostgreSQL (`users`) | Soft-deleted via `users.disabledAt` (`DELETE /api/users`) to preserve `audit_logs` integrity |
| Generation Jobs & Vault | PostgreSQL | Persisted per job lifecycle; active jobs cancelled and credits released on user deactivation |

### Data Deletion

- **Campaigns**: Deleting a campaign removes the record from PostgreSQL and appends an `audit_logs` entry.
- **User Accounts (`DELETE /api/users`)**: Sets `users.disabledAt` (soft delete), revokes pending invitations created by the user, cancels active generation jobs (releasing reserved credits), and records a `user_deactivated` audit event. Hard-deleting `users` rows is blocked by `ON DELETE RESTRICT` on `audit_logs.actorId`.
- **Audit Logs**: Immutable at the PostgreSQL layer via `audit_logs_immutable` and `audit_logs_no_truncate` triggers. Any regulatory archival or erasure of historical audit records must be performed through documented, privileged administrative procedures outside the runtime application role.

## Privacy by Design

### Data Minimization

ARES collects only essential data:

- **User Info**: Email, name, role, `orgId` (minimum for functionality)
- **Campaigns**: Only user-created attack manifests
- **Audit Logs**: Only necessary for compliance and security
- **No Analytics**: No usage tracking or telemetry by default
- **Session Cookies**: 1-hour `HttpOnly` session cookies (plus CSRF cookie for cookie-authenticated mutations)

### User Control

Users can:
- Export all their data (JSON format)
- Delete their campaigns
- Revoke access tokens
- Request account deletion (production mode)

Note: Production audit logs (`audit_logs`) are append-only and immutable (enforced by database triggers blocking `UPDATE`, `DELETE`, and `TRUNCATE`); they are retained per the configured retention policy and cannot be cleared or deleted by users.

## Compliance Alignment

> **Non-Certification Qualification:** The sections below describe technical controls and architectural alignment only. ARES is **not** GDPR-certified, SOC 2 Type II-certified, or ISO 27001-certified out of the box; formal compliance depends on your organization's governance, legal agreements, operational controls, and independent audit.

### GDPR (General Data Protection Regulation)

**Lawful Basis**: Legitimate interest (security testing) or consent

**User Rights Supported**:
- ✅ Right to Access (Article 15): Export all data
- ✅ Right to Rectification (Article 16): Edit campaign data
- ✅ Right to Erasure (Article 17): Delete campaigns and request account deletion
- ✅ Right to Restrict Processing (Article 18): Pause data processing
- ✅ Right to Data Portability (Article 20): Export in JSON format
- ✅ Right to Object (Article 21): Opt-out of optional processing

**GDPR Features**:
- Data processing records
- Privacy by design and default
- Data breach notification procedures
- Data Protection Impact Assessment (DPIA) available

### CCPA (California Consumer Privacy Act)

**Consumer Rights Supported**:
- ✅ Right to Know: What data is collected and how it's used
- ✅ Right to Delete: Request deletion of personal information
- ✅ Right to Opt-Out: No selling of personal information (we don't sell data)
- ✅ Right to Non-Discrimination: No discrimination for exercising rights

### HIPAA (Health Insurance Portability and Accountability Act)

**Note**: ARES is not HIPAA-compliant by default but can be configured for HIPAA environments.

**Required Configurations**:
- Business Associate Agreement (BAA) with hosting provider
- Encryption at rest and in transit (must be configured)
- Access controls and audit logging (available)
- Secure backup and disaster recovery (must be configured)
- No use of Protected Health Information (PHI) in testing without proper controls

### SOC 2 Type II

**Relevant Trust Principles**:
- **Security**: Access controls, encryption, audit logging
- **Availability**: Uptime monitoring, disaster recovery
- **Processing Integrity**: Data validation, error handling
- **Confidentiality**: Data protection measures
- **Privacy**: Data handling policies and user rights

**Evidence ARES Provides**:
- Audit logs of all user actions
- Access control enforcement records
- Security configuration documentation
- Incident response procedures

### ISO 27001

**Relevant Controls**:
- A.9: Access Control
- A.12: Operations Security
- A.14: System Acquisition, Development, and Maintenance
- A.18: Compliance

## Data Encryption

### Encryption at Rest

**Demo / Fallback Mode**: No encryption (`localStorage` is plain text in the browser).

**Production Mode (Infrastructure Responsibility)**:
Encryption at rest for PostgreSQL data, backups, and KMS key management are **not** implemented in ARES application code; they must be configured on your **PostgreSQL hosting provider and cloud infrastructure** (e.g., managed PostgreSQL disk/volume encryption and cloud KMS).

### Encryption in Transit

**Production Deployments**:
- ✅ TLS 1.2 or higher / HTTPS enforced at the hosting/reverse-proxy layer
- ✅ Encrypted PostgreSQL connections (`DATABASE_URL` with SSL/TLS)
- ✅ No mixed content

### Key Management

**API Keys & Secrets** (e.g., `GEMINI_API_KEY`, `JWT_SECRET`, `CSRF_SECRET`, `AUTH0_CLIENT_SECRET`):
- Stored in backend environment variables (not in code or database)
- Never transmitted to browser
- Rotated regularly per your organization's secrets management policy

**Database Encryption Keys**:
- Managed by your PostgreSQL hosting provider / cloud KMS infrastructure

## Data Breach Response

### Detection

Potential indicators of data breach:
- Unauthorized access to campaigns
- Unusual export activity
- Failed authentication patterns
- Suspicious API usage
- Security alert from monitoring tools

### Response Procedure

1. **Containment** (within 1 hour)
   - Revoke compromised credentials
   - Block suspicious IP addresses
   - Isolate affected systems

2. **Assessment** (within 24 hours)
   - Determine scope of breach
   - Identify affected data and users
   - Document timeline of events

3. **Notification** (per legal requirements)
   - **GDPR**: Within 72 hours of awareness
   - **CCPA**: Without unreasonable delay
   - Users: Promptly notify affected users
   - Regulators: As required by jurisdiction

4. **Remediation**
   - Fix vulnerability
   - Restore from clean backup if needed
   - Force password resets
   - Enhanced monitoring

5. **Post-Incident**
   - Document lessons learned
   - Update security controls
   - Review and improve procedures
   - Provide user support

## Data Sharing and Third Parties

### We DO NOT:
- ❌ Sell user data
- ❌ Share data with advertisers
- ❌ Use data to train AI models
- ❌ Provide data to third parties for marketing
- ❌ Track users across websites

### We DO:
- ✅ Use Google Gemini API (or configured OpenAI / Anthropic / local LLM provider) for AI payload generation via the secure backend
- ✅ Store data with your configured PostgreSQL and cloud hosting provider (e.g., Vercel)
- ✅ Authenticate users via Auth0 (OAuth2/OIDC) when configured (SAML 2.0 is disabled in this release and returns `501 Not Implemented`)
- ✅ Share data with your organization's administrators as configured

### Third-Party Services

| Service | Purpose | Data Shared | Privacy Policy |
|---------|---------|-------------|----------------|
| Vercel | Hosting | Application logs, metadata | [Vercel Privacy](https://vercel.com/legal/privacy-policy) |
| Google Gemini | AI generation | Tactic descriptions | [Google AI Privacy](https://ai.google.dev/gemini-api/terms) |
| Auth0 | OAuth2/OIDC Authentication | Email, name, `sub` (per OIDC scope) | [Okta/Auth0 Privacy](https://www.okta.com/privacy-policy/) |

**Note**: In self-hosted deployments, you control all third-party integrations.

## User Rights and Requests

### How to Exercise Your Rights

**Export Your Data**:
1. Log in to ARES Dashboard
2. Export campaigns as JSON from the dashboard or via `/api/campaigns`
3. Admins can export organization audit logs via `/api/audit-logs`

**Delete Your Data** (Demo / Fallback Mode):
1. Clear browser `localStorage`
2. Or use browser settings to clear site data

**Deactivate Your Account / Delete Campaigns** (Production Mode):
1. Delete campaigns directly via the UI or `DELETE /api/campaigns`
2. Contact your organization's ARES administrator to deactivate your account via `DELETE /api/users` (which sets `users.disabledAt`, revokes pending invitations, and cancels active generation jobs while preserving immutable `audit_logs` integrity)

**Correct Your Data**:
- Edit campaigns directly in the UI
- Update profile via Auth0
- Contact administrator for role or organization changes

## Data Portability

### Export Format

Data exported in JSON format following this structure:

```json
{
  "export_date": "2024-12-26T00:00:00Z",
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "name": "User Name",
    "role": "analyst"
  },
  "campaigns": [
    {
      "id": "campaign_123",
      "name": "Campaign Name",
      "framework": "OWASP LLM Top 10",
      "created_at": "2024-01-01T00:00:00Z",
      "tactics": [...],
      "payloads": [...]
    }
  ],
  "audit_logs": [
    {
      "timestamp": "2024-01-01T00:00:00Z",
      "action": "campaign_created",
      "resource_id": "campaign_123"
    }
  ]
}
```

### Import Support

Currently, ARES supports:
- ✅ JSON campaign import
- ✅ Compatible with ARES export format
- 🔜 CSV import (planned)
- 🔜 STIX format (planned)

## International Data Transfers

### Data Residency

**Demo Mode**: Data stays in user's browser (no transfer)

**Production Mode**: Data stored in cloud provider regions

**Supported Regions** (Vercel):
- North America (US, Canada)
- Europe (EU, UK)
- Asia Pacific (Singapore, Tokyo, Sydney)
- Custom regions available for enterprise

### Transfer Mechanisms

For international data transfers, we rely on:
- EU-US Data Privacy Framework (for US transfers)
- Standard Contractual Clauses (SCCs)
- Adequacy decisions (per EU Commission)

**Enterprise customers** can configure:
- Data residency requirements
- Region-specific deployments
- Data localization per regulations

## Configuration Reference

Refer to `.env.example` for supported backend environment variables (`DATABASE_URL`, `AUTH0_*`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CSRF_SECRET`, `ALLOWED_ORIGINS`, `APP_URL`, `TRUST_PROXY`, `GEMINI_API_KEY`, etc.). Retention, archival, legal hold, and database encryption-at-rest/KMS are managed at the PostgreSQL/cloud infrastructure layer rather than via application environment variables.

> **Compliance & Certification Note:** ARES provides technical controls (such as RBAC, `orgId` tenant scoping, append-only audit logging, and JSON data export) that can support an organization's compliance program, **but ARES itself is not GDPR-certified, SOC 2 Type II-certified, or ISO 27001-certified**. Formal compliance requires organizational policies, legal agreements (such as DPAs/BAAs), infrastructure hardening, and independent third-party audits.

## Additional Resources

- **Security**: [SECURITY.md](../SECURITY.md) - Security policy and vulnerability reporting
- **SOC 2 Alignment**: [SOC2_COMPLIANCE.md](SOC2_COMPLIANCE.md) - Technical control alignment guidance
- **Threat Model**: [THREAT_MODEL.md](THREAT_MODEL.md) - Security threat analysis
- **Responsible Use**: [RESPONSIBLE_USE.md](RESPONSIBLE_USE.md) - Ethical guidelines

## Contact

For data handling questions:
- **Privacy Inquiries**: Open a GitHub Discussion
- **Data Requests**: Contact your organization's administrator
- **Security Concerns**: See [SECURITY.md](SECURITY.md)
- **General Questions**: GitHub Discussions

---

**Last Updated**: December 2024  
**Version**: 0.9.0  
**Next Review**: March 2025

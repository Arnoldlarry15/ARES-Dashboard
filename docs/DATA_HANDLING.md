# Data Handling Policy

## Overview

This document describes how ARES Dashboard handles, stores, processes, and protects data. Understanding ARES's data handling practices is essential for compliance with privacy regulations and maintaining data security.

## Executive Summary

**Key Points:**
- ARES demo mode stores data **only in browser localStorage** (client-side)
- **No server-side data persistence** in default configuration
- API keys and secrets stored **only in secure backend** environment variables
- Production deployments should use **backend database** with encryption
- **Configurable data retention** policies for enterprise deployments
- **No training on customer data** - ARES never uses your data to train models
- **Privacy by design** - minimal data collection and strong default settings

## Data Classification

ARES handles several types of data with different sensitivity levels:

### 1. Campaign Data
**Sensitivity**: Confidential  
**Contains**: Attack manifests, tactics, vectors, payloads, target information  
**Storage**: Browser localStorage (demo) or backend database (production)  
**Retention**: User-controlled (demo) or configurable (production)

### 2. User Data
**Sensitivity**: Confidential  
**Contains**: Email, name, role, authentication tokens  
**Storage**: Browser localStorage (demo) or identity provider (production)  
**Retention**: Session-based (24 hours) or per identity provider policy

### 3. Audit Logs
**Sensitivity**: Confidential  
**Contains**: User actions, timestamps, IP addresses, resource access  
**Storage**: Browser localStorage (demo) or backend database (production)  
**Retention**: 90 days (default) or configurable

### 4. System Metadata
**Sensitivity**: Internal  
**Contains**: Theme preferences, UI state, last access times  
**Storage**: Browser localStorage  
**Retention**: Indefinite until user clears

### 5. AI Prompts and Responses
**Sensitivity**: Confidential  
**Contains**: Tactic descriptions sent to AI, generated payloads  
**Storage**: Temporary (in-memory during generation), not persisted by default  
**Retention**: Not stored unless explicitly saved to campaign

## Data Storage by Deployment Mode

### Demo Mode (Default)

**Storage Location**: Browser localStorage only

**What's Stored Locally**:
- User session (email, name, role, token)
- Saved campaigns (attack manifests)
- Audit logs (user activity)
- UI preferences (theme, shortcuts)
- Progress state (current campaign)

**What's NOT Stored**:
- Nothing persists on servers
- No database
- No server-side session storage
- No centralized audit logs

**Data Persistence**:
- Data persists until browser localStorage is cleared
- Session expires after 24 hours of inactivity
- Users can delete campaigns manually
- Clearing browser data removes all ARES data

**Security Characteristics**:
- Data isolated per browser/device
- No network transmission of campaign data (except AI generation)
- Vulnerable to XSS attacks (if vulnerability exists)
- No encryption at rest by default
- Subject to browser storage limits (~5-10MB)

### Production Mode (Recommended)

**Storage Location**: Backend database + identity provider

**What's Stored on Backend**:
- User profiles (managed by identity provider)
- Campaigns and attack manifests
- Audit logs (immutable, tamper-evident)
- Team workspace data
- Sharing permissions
- Configuration and settings

**What's NOT Stored**:
- Plain-text passwords (OAuth only)
- API keys in database (environment variables only)
- Unencrypted sensitive data
- AI training data

**Data Persistence**:
- Configurable retention policies per data type
- Automatic expiration and deletion
- Secure data archival options
- Legal hold capabilities

**Security Characteristics**:
- Encryption at rest (database-level)
- Encryption in transit (TLS 1.2+)
- Access controls and RBAC
- Audit logging of data access
- Backup and disaster recovery
- Secure deletion (NIST 800-88 guidelines)

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
                                      Cryptographic signing
```

## Data Retention Policies

### Default Retention (Recommended)

| Data Type | Retention Period | Rationale |
|-----------|------------------|-----------|
| Campaigns | User-controlled | Red team scenarios may be reused |
| Audit Logs | 90 days | Compliance requirement (SOC 2, ISO 27001) |
| User Sessions | 24 hours | Security best practice |
| AI Prompts | Not stored | Privacy by design |
| Deleted Items | 30 days (recoverable) | Accidental deletion protection |
| Exported Reports | Not stored | User responsibility |

### Configurable Retention (Production)

Organizations can configure retention via environment variables:

```bash
# Audit log retention (days)
AUDIT_LOG_RETENTION_DAYS=90

# Campaign retention (days, 0 = indefinite)
CAMPAIGN_RETENTION_DAYS=0

# Soft delete recovery period (days)
SOFT_DELETE_RECOVERY_DAYS=30

# Session timeout (hours)
SESSION_TIMEOUT_HOURS=24

# Automatic archive threshold (days)
AUTO_ARCHIVE_AFTER_DAYS=180
```

### Legal Hold

When legal hold is enabled:
- Normal retention policies suspended
- Data preserved indefinitely until hold lifted
- Audit trail of hold application and removal
- Restricted access during hold period

### Data Deletion

**Soft Delete** (default):
- Data marked as deleted but retained for recovery period
- Not visible to users
- Automatically purged after recovery period
- Can be recovered by admins

**Hard Delete** (after recovery period or on request):
- Data permanently removed from database
- Secure deletion per NIST 800-88 guidelines
- Audit log entry created (non-deletable)
- Cannot be recovered

## Privacy by Design

### Data Minimization

ARES collects only essential data:

- **User Info**: Email, name, role (minimum for functionality)
- **Campaigns**: Only user-created attack manifests
- **Audit Logs**: Only necessary for compliance and security
- **No Analytics**: No usage tracking or telemetry by default
- **No Cookies**: Session management via localStorage or secure cookies (production)

### Default Settings

Privacy-protective defaults:

```bash
# Prompt storage disabled by default
PROMPT_STORAGE=false

# Logging requires explicit enablement
LOGGING_ENABLED=false

# No data sharing with third parties
DATA_SHARING=false

# Analytics and telemetry disabled
TELEMETRY_ENABLED=false

# Minimal data collection
COLLECT_USAGE_DATA=false
```

### User Control

Users can:
- Export all their data (JSON format)
- Delete their campaigns
- Clear their audit logs (subject to retention policies)
- Revoke access tokens
- Request account deletion (production mode)

## Compliance Alignment

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

**Demo Mode**: No encryption (localStorage is plain text)

**Production Mode** (recommended configuration):
- Database encryption (AES-256)
- Encrypted backups
- Encrypted audit logs
- Key management (AWS KMS, Azure Key Vault, GCP KMS)

### Encryption in Transit

**All Modes**:
- ✅ TLS 1.2 or higher required
- ✅ HTTPS enforced for all connections
- ✅ Secure WebSocket connections (wss://)
- ✅ Certificate validation
- ✅ No mixed content

### Key Management

**API Keys** (e.g., Gemini API key):
- Stored in environment variables (not in code)
- Never transmitted to browser
- Rotated regularly (recommended: quarterly)
- Revoked immediately if compromised

**Encryption Keys** (production):
- Managed by cloud provider KMS
- Automatic rotation
- Audit logging of key usage
- Separate keys for different environments (dev, staging, prod)

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
- ✅ Use Google Gemini API for AI payload generation (via secure backend)
- ✅ Store data with cloud hosting provider (Vercel, or your choice)
- ✅ Share data with identity provider (Google, Microsoft, Okta - production mode)
- ✅ Share data with your IT administrators (as configured)

### Third-Party Services

| Service | Purpose | Data Shared | Privacy Policy |
|---------|---------|-------------|----------------|
| Vercel | Hosting | Application logs, metadata | [Vercel Privacy](https://vercel.com/legal/privacy-policy) |
| Google Gemini | AI generation | Tactic descriptions (ephemeral) | [Google AI Privacy](https://ai.google.dev/gemini-api/terms) |
| OAuth Provider | Authentication | Email, name (per OAuth scope) | Per provider |

**Note**: In self-hosted deployments, you control all third-party integrations.

## User Rights and Requests

### How to Exercise Your Rights

**Export Your Data**:
1. Log in to ARES Dashboard
2. Navigate to Settings > Data Export
3. Click "Export All My Data"
4. Receive JSON file with all your data

**Delete Your Data** (Demo Mode):
1. Clear browser localStorage
2. Or use browser settings to clear site data

**Delete Your Data** (Production Mode):
1. Contact your organization's ARES administrator
2. Or submit request to data protection officer
3. Data will be deleted within 30 days

**Correct Your Data**:
- Edit campaigns directly in the UI
- Update profile via identity provider
- Contact administrator for corrections

### Response Timeline

- **Access Requests**: Within 7 days
- **Deletion Requests**: Within 30 days
- **Correction Requests**: Immediate (self-service) or within 7 days
- **Objection Requests**: Within 14 days

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

### Environment Variables for Data Handling

```bash
# Data Retention
AUDIT_LOG_RETENTION_DAYS=90
CAMPAIGN_RETENTION_DAYS=0  # 0 = indefinite
SOFT_DELETE_RECOVERY_DAYS=30
SESSION_TIMEOUT_HOURS=24

# Privacy Controls
PROMPT_STORAGE=false  # Don't store AI prompts
LOGGING_ENABLED=false  # Explicit opt-in for logging
COLLECT_USAGE_DATA=false  # No analytics by default
TELEMETRY_ENABLED=false  # No telemetry

# Encryption
ENCRYPTION_AT_REST=true  # Database encryption
ENCRYPTION_KEY_ID=kms-key-id  # KMS key for encryption

# Data Processing
AUTO_ARCHIVE_AFTER_DAYS=180  # Archive old campaigns
ENABLE_LEGAL_HOLD=false  # Legal hold capability

# Compliance
GDPR_MODE=true  # Enable GDPR features
CCPA_MODE=true  # Enable CCPA features
HIPAA_MODE=false  # HIPAA mode (requires BAA)
```

## Additional Resources

- **Security**: [SECURITY.md](SECURITY.md) - Security policy and vulnerability reporting
- **Privacy**: [PRIVACY.md](PRIVACY.md) - Privacy policy for users
- **Compliance**: [COMPLIANCE.md](COMPLIANCE.md) - Compliance framework details
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

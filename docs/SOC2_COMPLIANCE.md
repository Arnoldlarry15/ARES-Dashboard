# SOC 2 Compliance Documentation

## Overview

This document outlines how ARES Dashboard's implemented technical controls align with SOC 2 Type II Trust Service Criteria, providing guidance for organizations integrating ARES into their security program.

**Disclaimer**: ARES Dashboard does **not** by itself satisfy or certify compliance with SOC 2, ISO 27001, or GDPR. Technical controls in the application (such as RBAC, organization scoping, and audit logging) must be combined with organizational policies, infrastructure controls, and independent external audits for formal compliance or certification.

## Trust Service Criteria

### Security (Common Criteria)

#### CC1: Control Environment

**Organizational Structure**
- Open-source project with defined maintainer roles
- Code review process for all changes
- Security-focused development practices

**Evidence**:
- GitHub repository with branch protection
- Required code reviews (see [CONTRIBUTING.md](./CONTRIBUTING.md))
- CI/CD pipeline with automated checks

#### CC2: Communication and Information

**Internal Communication**:
- GitHub Issues for bug tracking
- Pull Requests for feature discussion
- Discussions for community questions

**External Communication**:
- Public documentation
- Security advisories
- Release notes

**Evidence**:
- Public README and documentation
- SECURITY.md for vulnerability reporting
- Regular changelog updates

#### CC3: Risk Assessment

**Security Risk Management**:
- Regular dependency scanning (Dependabot)
- Automated security scanning (CodeQL)
- Threat modeling (see THREAT_MODEL.md)

**Evidence**:
- `.github/workflows/codeql.yml`
- `.github/dependabot.yml`
- THREAT_MODEL.md

#### CC4: Monitoring Activities

**Continuous Monitoring**:
- CI/CD pipeline runs on all commits
- Automated test suite
- Dependency vulnerability scanning

**Evidence**:
- GitHub Actions workflows
- Test coverage reports
- npm audit results

#### CC5: Control Activities

**Access Controls**:
- Role-based access control (RBAC)
- Four user role levels
- Permission enforcement

**Evidence**:
- `types/auth.ts` - Role definitions
- `services/authService.ts` - Permission checks
- Tests in `tests/security/authorization.test.ts`

#### CC6: Logical and Physical Access Controls

**Authentication**:
- Session management with expiration
- JWT token support (for production)
- OAuth 2.0/OIDC integration ready

**Evidence**:
- `services/authService.ts`
- `services/auth/OAUTH_INTEGRATION.md`
- Session expiration (1 hour access token; 7-day refresh token)

**Authorization**:
- Backend permission enforcement
- Resource-level access control
- Multi-tenant isolation (application-level `orgId` scoping)

**Evidence**:
- Permission middleware (`lib/middleware/auth.ts`)
- Application-level `orgId` scoping across API handlers and repositories (Note: PostgreSQL Row-Level Security is not enabled)
- Authorization tests

#### CC7: System Operations

**Change Management**:
- Version control (Git)
- Code review process
- Automated testing before merge

**Evidence**:
- GitHub protected branches
- Required PR approvals
- CI test gates

**Backup and Recovery**:
- Database backup procedures documented
- Deployment rollback capability
- Disaster recovery procedures

**Evidence**:
- `database/DATABASE.md` - Backup procedures
- Vercel rollback functionality
- Release management process

#### CC8: Change Management

**Development Process**:
1. Feature request/bug report
2. Code development
3. Testing (unit, integration, E2E)
4. Code review
5. Security review
6. Deployment

**Evidence**:
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- CI/CD workflows
- Test suites

#### CC9: Risk Mitigation

**Security Controls**:
- Input validation and sanitization
- SQL injection prevention
- XSS protection
- CSRF protection
- Rate limiting

**Evidence**:
- `lib/middleware/validation.ts`
- `lib/middleware/security.ts`
- Parameterized database queries (Prisma)
- Security tests

### Availability

#### A1: Availability

**Infrastructure**:
- Vercel global CDN
- Auto-scaling serverless functions
- 99.9% uptime SLA (Vercel)

**Monitoring**:
- Error tracking (recommended: Sentry)
- Performance monitoring
- Uptime monitoring

**Evidence**:
- Vercel deployment logs
- Health check endpoint implemented at `api/health.ts` (`/api/health`), which checks PostgreSQL connectivity (`SELECT 1` and `pgvector` extension presence) and external AI/Auth0 configuration; note that its `checkCache` check is currently a simulated placeholder returning `status: 'healthy'` rather than testing an external cache service

### Processing Integrity

#### PI1: Processing Integrity

**Data Validation**:
- Input validation on all API endpoints
- Type checking (TypeScript)
- Schema validation

**Evidence**:
- TypeScript strict mode
- Validation middleware
- API tests

**Error Handling**:
- Graceful error handling
- Error boundaries (React)
- Structured error responses

**Evidence**:
- Error boundary component
- API error responses
- Error logging

### Confidentiality

#### C1: Confidentiality

**Data Protection**:
- API keys stored securely (environment variables)
- Sensitive data not logged
- Secure communication (HTTPS only)

**Evidence**:
- `.env.example` (no secrets committed)
- Backend API key storage
- Vercel HTTPS enforcement

**Access Restrictions**:
- Organization-based isolation (`orgId` scoping)
- Permission-based access
- Session management

**Evidence**:
- Application-level `orgId` scoping in API endpoints and repositories
- Permission middleware (`lib/middleware/auth.ts`)
- Session expiration

### Privacy

#### P1: Privacy Notice

**Data Collection**:
- Campaign data (user-created)
- Audit logs (user actions)
- Session data (authentication)

**Data Usage**:
- Provide red teaming functionality
- Audit and compliance
- Security monitoring

**Evidence**:
- DATA_HANDLING.md
- Audit log documentation

#### P2: Data Subject Rights

**User Rights**:
- Access to own data
- Account deactivation / soft deletion (`users.disabledAt`)
- Data portability (campaign and audit exports)

**Audit Log Immutability & Schema**:
- The `audit_logs` table (`prisma/schema.prisma`) stores `id`, `orgId`, `actorId`, `action`, `target`, `details`, `ipAddress`, `userAgent`, and `timestamp` (note: there is no `user_id` column, and `audit_logs.actorId` references `users.id` with `ON DELETE RESTRICT`).
- `audit_logs` is enforced as append-only at the PostgreSQL level via:
  - `audit_logs_immutable`: `BEFORE UPDATE OR DELETE ON "audit_logs" FOR EACH ROW` trigger (`prevent_audit_log_mutation()`).
  - `audit_logs_no_truncate`: `BEFORE TRUNCATE ON "audit_logs" FOR EACH STATEMENT` trigger (`prevent_audit_log_truncate()`).
- **Runtime DB Role Requirement**: For append-only triggers to be effective in production, the application must connect using a **separate non-owner, non-superuser PostgreSQL role** (a table owner or superuser can disable triggers).
- Because `audit_logs` is append-only, user offboarding (`DELETE /api/users`) uses soft deletion (`users.disabledAt` via `UserRepository.deleteInOrg`), enforces a last-admin `409 Conflict` guard, revokes pending invitations created by the user, and cancels active generation jobs (`cancelActiveJobsForUserInTx`) while releasing reserved credits back to the user's balance/ledger. Any regulatory erasure of historical audit records must be handled through documented, privileged administrative procedures outside the runtime application role.

**Evidence**:
- `prisma/schema.prisma` (`AuditLog`, `User.disabledAt`)
- `prisma/migrations/20261127090000_audit_log_org_and_immutability/migration.sql`
- `prisma/migrations/20261127100000_onboarding_legacy_org_and_audit_truncate/migration.sql`
- `DATA_HANDLING.md`

#### P3: Data Quality

**Data Accuracy**:
- User input validation
- Data integrity constraints (database)
- Regular backups

**Evidence**:
- Validation middleware
- Database constraints
- Backup procedures

## Audit Evidence

### Control Activities Evidence

| Control | Evidence Location | Frequency |
|---------|------------------|-----------|
| Code Review | GitHub PRs | Per change |
| Security Scanning | CodeQL results | Per commit |
| Dependency Audit | Dependabot alerts | Weekly |
| Access Control Testing | `tests/security/` | Per commit |
| Penetration Testing | External audit | Annually |

### Monitoring and Logging

**Application Logs**:
- API request logs
- Error logs
- Authentication events

**Audit Logs**:
- User login/logout
- Campaign creation/modification
- Permission changes
- Configuration changes

**Evidence**:
```typescript
// repositories/auditLogRepository.ts - AuditLogRepository.create()
await AuditLogRepository.create({
  orgId,
  actorId: authUser.userId,
  action: 'user_deactivated',
  target: targetId,
  details: { mode: 'soft_delete' },
});
```

### Security Testing

**Automated Testing**:
- 35+ unit and integration tests
- Security-specific test suite
- E2E functional tests
- CI/CD pipeline enforcement

**Evidence**:
- `tests/` directory
- CI workflow results
- Code coverage reports

## Compliance Procedures

### 1. Access Review

**Frequency**: Quarterly

**Procedure**:
1. Review all user accounts
2. Verify role assignments
3. Remove inactive accounts
4. Update documentation

**Evidence**: Access review log

### 2. Security Patch Management

**Frequency**: As needed (within SLA)

**Procedure**:
1. Dependabot alerts reviewed daily
2. Critical patches within 24 hours
3. High severity within 1 week
4. Regular updates monthly

**Evidence**: GitHub security alerts, deployment logs

### 3. Incident Response Testing

**Frequency**: Quarterly

**Procedure**:
1. Tabletop exercise
2. Fire drill simulation
3. Document findings
4. Update procedures

**Evidence**: Incident response test reports

### 4. Backup Verification

**Frequency**: Monthly

**Procedure**:
1. Verify backup completion
2. Test restore procedure
3. Verify data integrity
4. Document results

**Evidence**: Backup logs, restore test results

### 5. Audit Log Review

**Frequency**: Weekly

**Procedure**:
1. Review audit logs
2. Identify anomalies
3. Investigate suspicious activity
4. Document findings

**Evidence**: Audit log review reports

## Implementation Guide

### For Organizations Deploying ARES

#### Phase 1: Setup (Week 1-2)

- [ ] Deploy ARES Dashboard
- [ ] Configure OAuth authentication
- [ ] Set up PostgreSQL database
- [ ] Enable audit logging
- [ ] Configure backups

#### Phase 2: Security Controls (Week 3-4)

- [ ] Implement network security
- [ ] Configure rate limiting
- [ ] Set up monitoring
- [ ] Enable error tracking
- [ ] Conduct security review

#### Phase 3: Procedures (Week 5-6)

- [ ] Document access procedures
- [ ] Create incident response plan
- [ ] Establish backup schedule
- [ ] Define change management
- [ ] Train staff

#### Phase 4: Testing (Week 7-8)

- [ ] Vulnerability assessment
- [ ] Penetration testing
- [ ] Incident response drill
- [ ] Backup restore test
- [ ] User acceptance testing

#### Phase 5: Audit Preparation (Week 9-10)

- [ ] Collect evidence
- [ ] Document controls
- [ ] Review audit logs
- [ ] Prepare control documentation
- [ ] Conduct readiness assessment

## Continuous Compliance

### Daily
- Monitor security alerts
- Review error logs
- Check system health

### Weekly
- Review audit logs
- Check for dependency updates
- Review access requests

### Monthly
- Backup verification
- Security patch updates
- Access review (if needed)

### Quarterly
- Access review
- Incident response testing
- Security assessment
- Documentation update

### Annually
- External penetration test
- Compliance audit
- Business continuity test
- Policy review

## Example Attestation Template

> **Note**: This template is an example for organizations documenting their own internal controls; it does not constitute a SOC 2 attestation or certification of ARES Dashboard itself.

```
[Your Organization] Internal Control Attestation (Using ARES Dashboard)

Organization: [Your Organization]
Period: [Start Date] to [End Date]
Date: [Current Date]

This is to attest that [Organization] has implemented and maintains
controls as described in the ARES Dashboard SOC 2 Compliance Documentation
for the period specified above.

The controls have been designed and operated effectively to meet the
Trust Service Criteria for Security, Availability, Processing Integrity,
Confidentiality, and Privacy.

Evidence of control operation is available for audit review.

Authorized Signatory:
Name: [Name]
Title: [Title]
Signature: [Signature]
Date: [Date]
```

## Resources

- [AICPA SOC 2 Overview](https://www.aicpa.org/interestareas/frc/assuranceadvisoryservices/socforserviceorganizations.html)
- [Trust Services Criteria](https://www.aicpa.org/content/dam/aicpa/interestareas/frc/assuranceadvisoryservices/downloadabledocuments/trust-services-criteria.pdf)
- [ARES Security Documentation](../SECURITY.md)
- [ARES Threat Model](../THREAT_MODEL.md)

---

**Note**: This documentation is a starting point. Organizations should work with qualified auditors and compliance professionals for official SOC 2 certification.

**Last Updated**: 2024-01-15
**Version**: 1.0

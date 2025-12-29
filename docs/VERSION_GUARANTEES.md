# ARES Version Guarantees & Behavioral Stability

## Executive Summary

This document defines what guarantees ARES v1.0 provides, what may change without notice, and what will never change. These are behavioral promises, not just Git tags, to prevent enterprise fears of "silent behavior drift."

**Document Version**: 1.0.0  
**Last Updated**: December 2024  
**Applies to**: ARES Dashboard v1.0.0 and later

---

## Semantic Versioning Promise

ARES follows strict **semantic versioning (semver 2.0.0)** for behavioral guarantees:

### Version Format: MAJOR.MINOR.PATCH

```
Example: 1.2.3
         │ │ │
         │ │ └─ PATCH: Bug fixes, no behavior changes
         │ └─── MINOR: New features, backward compatible
         └───── MAJOR: Breaking changes, behavior changes
```

### Commitment
**We promise:** Version numbers accurately reflect behavioral impact  
**You can trust:** Minor and patch updates are safe to deploy  
**You control:** Whether to adopt major version breaking changes

---

## Version 1.x Guarantees (Current)

The following are **guaranteed stable** throughout all v1.x releases:

### 1. Framework Structure Stability

#### What's Guaranteed:
- **OWASP LLM Top 10 structure**: Tactic IDs (LLM01-LLM10) remain consistent
- **MITRE ATLAS structure**: Tactic and technique taxonomy unchanged
- **MITRE ATT&CK structure**: Technique ID mapping stable
- **Framework metadata format**: Description, severity, references structure
- **Tactic-to-technique relationships**: Mappings remain valid

#### What This Means:
```typescript
// This code will work across ALL v1.x versions
const tactic = getTactic("LLM01");
expect(tactic.name).toBe("Prompt Injection");
expect(tactic.framework).toBe("owasp");
// Structure guaranteed unchanged in v1.x
```

#### Breaking Change Example (Would Require v2.0):
```typescript
// ❌ Would require MAJOR version bump (v2.0)
// Changing tactic IDs: LLM01 → OWASP-PI-01
// Renaming fields: tactic.name → tactic.title
// Removing fields: tactic.severity
```

### 2. Campaign Data Structure Stability

#### What's Guaranteed:
- **Campaign JSON schema**: Export format structure unchanged
- **Required fields**: id, name, framework, tactic, vectors remain
- **Import/export compatibility**: v1.x exports readable by all v1.x versions
- **Database schema**: Core tables (Campaign, User, AuditLog) structure stable
- **Campaign metadata**: Structure and field names consistent

#### What This Means:
```json
// Campaign exported from v1.0 will import into v1.9
{
  "id": "campaign-123",
  "name": "Test Campaign",
  "framework": "owasp",
  "tactic": "LLM01",
  "vectors": ["..."],
  "payloads": ["..."]
  // This structure guaranteed across v1.x
}
```

#### Allowed Changes (MINOR version):
```json
// ✓ Adding optional fields is allowed (v1.1+)
{
  "id": "campaign-123",
  "name": "Test Campaign",
  "newOptionalField": "value"  // Optional, ignored by older versions
}
```

### 3. Authentication & Authorization Stability

#### What's Guaranteed:
- **Four user roles**: Admin, Red Team Lead, Analyst, Viewer
- **Role permissions**: Permission matrix remains consistent
- **JWT token structure**: Core claims (sub, role, orgId, exp) unchanged
- **Backend RBAC enforcement**: Authorization logic consistent
- **Session behavior**: 24-hour token expiration, refresh token support

#### What This Means:
```typescript
// Admin role will ALWAYS have these permissions in v1.x
const adminPermissions = {
  createCampaign: true,
  deleteCampaign: true,
  manageTeam: true,
  exportAuditLogs: true
};
// No silent permission drift
```

#### Breaking Change Example (Would Require v2.0):
```typescript
// ❌ Would require MAJOR version bump (v2.0)
// Removing a role: Viewer role eliminated
// Changing permissions: Admin loses exportAuditLogs
// Changing token structure: JWT → OAuth2 token format
```

### 4. API Contract Stability

#### What's Guaranteed:
- **API endpoints**: Paths remain unchanged (/api/campaigns, /api/users, etc.)
- **Request/response schemas**: Structure consistent for existing endpoints
- **Error formats**: Error response structure unchanged
- **HTTP status codes**: Consistent use of 200, 400, 401, 403, 500
- **Authentication headers**: Authorization header format consistent

#### What This Means:
```typescript
// API clients can rely on this contract across v1.x
POST /api/campaigns
Request: { name: string, framework: string, tactic: string }
Response: { id: string, name: string, createdAt: string }
// Contract guaranteed stable
```

#### Allowed Changes (MINOR version):
```typescript
// ✓ Adding optional request fields (v1.1+)
POST /api/campaigns
Request: { 
  name: string, 
  framework: string, 
  tactic: string,
  description?: string  // New optional field
}

// ✓ Adding response fields (v1.1+)
Response: { 
  id: string, 
  name: string, 
  createdAt: string,
  tags?: string[]  // New field, clients can ignore
}
```

### 5. UI Behavioral Stability

#### What's Guaranteed:
- **Keyboard shortcuts**: Ctrl+S (save), Ctrl+O (open), Ctrl+K (search), etc.
- **Three-step workflow**: Framework → Tactics → Vectors/Payloads
- **Theme toggle**: Dark/light mode switch behavior
- **Campaign management**: Save, load, delete operations
- **Team management**: Workspace and sharing functionality
- **Audit log access**: Admin/Red Team Lead access guaranteed

#### What This Means:
```typescript
// User muscle memory protected across v1.x
// Ctrl+S always saves campaign
// Step navigation always works the same way
// No surprise UI behavior changes
```

#### Allowed Changes (MINOR version):
```typescript
// ✓ Adding new shortcuts (v1.1+)
// Ctrl+N for new campaign (new shortcut, doesn't break existing)

// ✓ Adding new UI features (v1.1+)
// New export format option (additional, not replacing)
```

### 6. Audit Log Stability

#### What's Guaranteed:
- **Log structure**: timestamp, actorId, action, target, metadata format
- **Action types**: Core actions (CAMPAIGN_CREATE, USER_LOGIN, etc.) unchanged
- **Log retention**: Logs never auto-deleted in v1.x (retention policy set by admin)
- **Export formats**: JSON, CSV, PDF format structure stable
- **Immutability**: Logs remain append-only, never modified

#### What This Means:
```json
// Audit log format guaranteed across v1.x
{
  "id": "log-123",
  "timestamp": "2024-12-29T10:30:00Z",
  "actorId": "user-123",
  "action": "CAMPAIGN_CREATE",
  "target": "campaign-456",
  "metadata": {}
  // Compliance tools can parse this reliably
}
```

---

## What May Change (Without Major Version Bump)

The following may change in **MINOR** versions (v1.1, v1.2, etc.):

### 1. AI-Generated Content Quality
**What May Change:**
- Improved payload generation algorithms
- Better mitigation strategy suggestions
- Enhanced attack vector diversity
- More accurate reference links

**Why It's Allowed:**
- AI content is explicitly probabilistic (see AI_BEHAVIOR.md)
- Changes improve quality, not break compatibility
- Static fallback remains unchanged

**Impact:**
- Users may see better AI outputs in newer versions
- No breaking changes to structure or APIs
- Reproducibility maintained in static mode

**Example:**
```typescript
// v1.0: AI generates 3 attack vectors
generateVectors("LLM01") // → 3 vectors

// v1.2: AI generates 5 attack vectors (improved)
generateVectors("LLM01") // → 5 vectors

// Impact: More comprehensive, but not breaking
```

### 2. Performance Optimizations
**What May Change:**
- Faster API responses
- Improved database query performance
- UI rendering optimizations
- Reduced bundle size

**Why It's Allowed:**
- Performance improvements don't change behavior
- Users benefit without code changes
- No API or data structure changes

**Impact:**
- Faster application, better UX
- No code changes required
- Seamless upgrade

### 3. Fallback Data Improvements
**What May Change:**
- Expanded static fallback data
- More comprehensive pre-defined payloads
- Additional framework examples
- Improved documentation links

**Why It's Allowed:**
- Additions, not replacements
- Existing data remains unchanged
- Structure stays consistent

**Impact:**
- Better offline experience
- More complete fallback coverage
- No breaking changes

**Example:**
```typescript
// v1.0: 5 pre-defined vectors for LLM01
fallbackData.LLM01.vectors.length // → 5

// v1.3: 10 pre-defined vectors (expanded)
fallbackData.LLM01.vectors.length // → 10

// Impact: More examples, backwards compatible
```

### 4. New Optional Features
**What May Change:**
- New optional fields in campaign exports
- Additional API endpoints
- New UI components or views
- Extra configuration options

**Why It's Allowed:**
- Optional, not required
- Backwards compatible
- Existing functionality unchanged

**Impact:**
- Users can adopt new features at their pace
- Old code continues working
- No forced migration

**Example:**
```json
// v1.0 campaign export
{ "id": "...", "name": "..." }

// v1.4 campaign export (with new optional field)
{ "id": "...", "name": "...", "tags": ["security"] }

// v1.0 can ignore "tags", still imports successfully
```

### 5. Security Patches
**What May Change:**
- Security vulnerability fixes
- Input validation improvements
- Authentication enhancements
- Authorization tightening

**Why It's Allowed:**
- Security is prioritized over stability
- Critical vulnerabilities require immediate fixes
- May tighten previously permissive behavior

**Impact:**
- Enhanced security posture
- May reject previously accepted (but insecure) inputs
- Documented in security advisories

**Example:**
```typescript
// v1.0: Accepts campaign names up to 1000 chars
createCampaign({ name: "x".repeat(1000) }) // ✓ Accepted

// v1.2: Security patch limits to 255 chars (DoS protection)
createCampaign({ name: "x".repeat(1000) }) // ✗ Rejected

// Impact: Prevents abuse, documented in security patch notes
```

### 6. Dependency Updates
**What May Change:**
- React version updates (within major version)
- Prisma ORM updates (within major version)
- Minor dependency security updates
- Build tool improvements

**Why It's Allowed:**
- Keeps dependencies secure and modern
- Addresses security vulnerabilities
- Improves developer experience

**Impact:**
- Users benefit from upstream fixes
- No behavior changes
- Regular maintenance

---

## What Will Change (Requiring PATCH Version Bump)

The following are **bug fixes only**, safe to deploy immediately:

### 1. Bug Fixes
**What Changes:**
- Incorrect behavior corrected
- UI bugs fixed
- API errors resolved
- Data corruption prevented

**Why It's Safe:**
- Restores intended behavior
- No new features
- No API changes
- No data structure changes

**Example:**
```typescript
// v1.2.0: Bug - Delete button not working for Analysts
// (Should work, but broken)

// v1.2.1: Fixed - Delete button now works
// Impact: Restores intended behavior, safe to deploy
```

### 2. Documentation Fixes
**What Changes:**
- Typo corrections
- Clarifications
- Updated examples
- Broken link fixes

**Impact:**
- Better documentation
- No code changes
- No behavior changes

### 3. Dependency Security Patches
**What Changes:**
- Critical security updates to dependencies
- Zero-day vulnerability patches
- CVE remediation

**Impact:**
- Improved security
- No behavior changes (unless exploited)
- Immediate deployment recommended

---

## What Will NEVER Change (Across All Versions)

The following are **permanent commitments** for ARES:

### 1. Core Mission
**Never Changes:**
- ARES is an AI Red Team Operations Dashboard
- Purpose: Plan, execute, audit adversarial testing
- Target users: Security professionals, red teams, researchers
- Ethical use: Defensive security testing only

**Why It Matters:**
- Product identity stability
- User expectations consistency
- Strategic positioning clarity

### 2. Open Source Commitment
**Never Changes:**
- ARES core remains open source
- MIT License (or compatible open source license)
- Community contributions welcomed
- No bait-and-switch to proprietary

**Why It Matters:**
- Trust in long-term availability
- Community ownership
- Transparency and auditability

### 3. Framework Alignment
**Never Changes:**
- Alignment with recognized security frameworks (OWASP, MITRE)
- Evidence-based approach to AI security
- Industry standards compliance
- Scientific rigor

**Why It Matters:**
- Credibility and legitimacy
- Regulatory acceptance
- Enterprise trust

### 4. Authorization Requirement
**Never Changes:**
- ARES never authorizes testing
- Users responsible for obtaining authorization
- Ethical use requirements
- No facilitation of unauthorized access

**Why It Matters:**
- Legal compliance
- Ethical standards
- Developer liability protection

### 5. Human-in-the-Loop
**Never Changes:**
- ARES is a tool, not autonomous agent
- Human review required for actual testing
- No automatic exploit execution
- Manual analysis and validation needed

**Why It Matters:**
- Safety and control
- Professional judgment priority
- Liability boundaries

### 6. Audit Logging
**Never Changes:**
- Comprehensive audit trail maintained
- User actions logged with attribution
- Immutable log structure
- Compliance support

**Why It Matters:**
- Accountability
- Regulatory compliance
- Forensic capability

---

## Breaking Changes (Requiring Major Version Bump)

The following **WOULD** require v2.0 or v3.0:

### Structural Changes
- ❌ Removing user roles (e.g., eliminating Viewer role)
- ❌ Changing campaign JSON schema in incompatible way
- ❌ Removing core frameworks (OWASP, MITRE ATLAS)
- ❌ Changing API endpoint paths
- ❌ Modifying JWT token structure

### Behavioral Changes
- ❌ Changing permission matrix for existing roles
- ❌ Altering keyboard shortcuts
- ❌ Removing UI features users depend on
- ❌ Changing audit log format
- ❌ Modifying three-step workflow

### Data Changes
- ❌ Renaming database tables or columns
- ❌ Changing required fields in APIs
- ❌ Removing support for old campaign formats
- ❌ Altering export formats incompatibly

### Commitment
**We promise:** Breaking changes will be clearly communicated, with:
- **Migration guide**: Step-by-step upgrade instructions
- **Deprecation notice**: At least one minor version warning before removal
- **Backward compatibility period**: Old versions supported during transition
- **Major version announcement**: Clear justification and impact assessment

---

## Upgrade Safety by Version Type

### PATCH Upgrades (v1.2.3 → v1.2.4)
**Safety:** ✅ Deploy immediately, zero risk
**Testing:** Smoke testing recommended, not required
**Rollback:** Not necessary, but trivial if needed
**CI/CD:** Can be auto-deployed

### MINOR Upgrades (v1.2.4 → v1.3.0)
**Safety:** ✅ Safe to deploy, low risk
**Testing:** Regression testing recommended
**Rollback:** Easy, backward compatible
**CI/CD:** Can be auto-deployed with testing gate

### MAJOR Upgrades (v1.9.5 → v2.0.0)
**Safety:** ⚠️ Review carefully, potential breaking changes
**Testing:** Full regression testing required
**Rollback:** Plan required, may need data migration rollback
**CI/CD:** Manual approval required, staged rollout

---

## Version Lifecycle

### Long-Term Support (LTS)
**v1.x LTS:**
- Security patches: 2 years from v1.0 release
- Bug fixes: 1 year from v1.0 release
- No new features after v2.0 release
- Minimum support until December 2026

### Version Support Matrix

| Version | Status | Released | EOL | Security Patches | Bug Fixes |
|---------|--------|----------|-----|------------------|-----------|
| v1.0.x  | Current | Dec 2024 | Dec 2026 | ✅ Yes | ✅ Yes |
| v0.9.x  | Legacy | Nov 2024 | Jun 2025 | ✅ Yes | ❌ No |
| < v0.9  | Unsupported | - | - | ❌ No | ❌ No |

---

## Migration Guarantees

When upgrading between versions:

### Data Migration
**We guarantee:**
- No data loss during upgrades
- Backward-compatible migrations
- Rollback capability
- Clear migration documentation

### Configuration Migration
**We guarantee:**
- Old configurations continue working (or clear deprecation)
- New defaults are safe
- Migration scripts provided for breaking changes

### API Compatibility
**We guarantee:**
- Old clients work with new servers (within major version)
- Deprecation warnings before removal
- At least one minor version overlap for deprecated APIs

---

## Communicating Changes

### How We Communicate

#### CHANGELOG.md
- Every release documented
- Breaking changes highlighted
- Migration steps provided
- Categorized by type (added, changed, deprecated, removed, fixed, security)

#### GitHub Releases
- Release notes for every version
- Asset downloads (ZIP, TAR.GZ)
- SHA-256 checksums
- Pre-release vs. stable designation

#### Security Advisories
- CVE information
- Affected versions
- Mitigation steps
- Patch availability

#### Deprecation Warnings
- In-code warnings for deprecated APIs
- Console log messages
- Documentation updates
- At least one minor version notice before removal

### What We Include

#### For PATCH Releases
- Bug descriptions
- Fix impact
- Affected versions
- No migration needed

#### For MINOR Releases
- New features
- Improvements
- Optional configuration changes
- Backward compatibility notes

#### For MAJOR Releases
- Breaking changes (highlighted)
- Migration guide
- Deprecation removals
- New features
- Upgrade timeline

---

## Version Tracking

Users can verify version guarantees:

### Check Current Version
```bash
# In application footer
# Or via API
curl https://your-ares-instance.com/api/version
{
  "version": "1.2.3",
  "major": 1,
  "minor": 2,
  "patch": 3,
  "prerelease": null
}
```

### Verify Compatibility
```bash
# Check if campaign export is compatible
{
  "schemaVersion": "1.0",
  "compatibleWith": ["1.x"],
  "requiresMinimum": "1.0.0"
}
```

### Test Before Upgrade
```bash
# Run compatibility checker
npm run check-compatibility --from=1.2.0 --to=1.5.0
# Reports: No breaking changes detected
```

---

## Enterprise Considerations

### For Regulated Industries
**Recommendation:** Pin to specific minor version, upgrade quarterly
**Rationale:** Minimizes change frequency, maintains compliance
**Testing:** Full regression before each upgrade

### For Continuous Deployment
**Recommendation:** Auto-upgrade patch versions, review minor versions
**Rationale:** Security patches deployed quickly, feature changes reviewed
**Testing:** Automated smoke tests for patches, manual for minor

### For Air-Gapped Environments
**Recommendation:** Evaluate each version offline, batch upgrades
**Rationale:** Limited upgrade windows, comprehensive testing required
**Testing:** Full suite in isolated environment

---

## Commitment to Users

**We understand:** Enterprises fear "silent behavior drift"  
**We commit:** Clear versioning, documented changes, migration support  
**We promise:** No surprises, no breaking changes in minor versions  
**We deliver:** Semantic versioning you can trust

---

## Related Documentation

- [AI_BEHAVIOR.md](AI_BEHAVIOR.md) - Determinism and reproducibility guarantees
- [TRUST_BOUNDARY.md](TRUST_BOUNDARY.md) - What ARES defends against
- [CHANGELOG.md](CHANGELOG.md) - Complete version history
- [RELEASE_MANAGEMENT.md](RELEASE_MANAGEMENT.md) - Release process

---

**Document Owner**: ARES Product Management  
**Next Review**: With each major version release  
**Approval Required**: Product lead and legal counsel for guarantee changes

**These are behavioral promises. We take them seriously.**

# ARES AI Behavior: Determinism & Reproducibility

## Executive Summary

This document explicitly defines which ARES outputs are deterministic, which are probabilistic, how hallucinations are handled, and how reproducibility is achieved. This is critical for enterprise trust and warranty expectations.

**Document Version**: 1.0.0  
**Last Updated**: December 2024  
**Applies to**: ARES Dashboard v1.0.0 and later

---

## Overview: Two Operating Modes

ARES Dashboard operates in two distinct modes with different behavior characteristics:

### Mode 1: Fallback Mode (Deterministic)
**When active:** When Gemini API key is not configured or API is unavailable  
**Behavior:** 100% deterministic, reproducible, static  
**Data source:** Pre-defined framework data embedded in application

### Mode 2: AI-Enhanced Mode (Probabilistic)
**When active:** When Gemini API key is configured and API is available  
**Behavior:** Partially probabilistic, non-deterministic, dynamic  
**Data source:** Real-time generation via Google Gemini API

---

## Deterministic Outputs (100% Reproducible)

The following ARES components produce **identical outputs** every time, regardless of mode:

### 1. Framework Structure
**Always Deterministic:**
- OWASP LLM Top 10 tactic list
- MITRE ATLAS technique taxonomy
- MITRE ATT&CK tactic structure
- Framework metadata and descriptions
- Tactic-to-technique mappings

**Guarantee:** Framework data is version-locked and does not change between releases.

**Reproducibility:** Same input always produces same output.

**Source:** Embedded in constants.tsx, updated only with version releases.

**Example:**
```typescript
// Always returns identical structure
const owaspTactics = getOWASPTactics(); 
// Result is deterministic, identical every time
```

### 2. User Interface Behavior
**Always Deterministic:**
- Step navigation logic
- Form validation rules
- UI component rendering
- Keyboard shortcut mappings
- Theme toggle behavior

**Guarantee:** UI behavior is code-determined and consistent.

**Reproducibility:** Same user actions produce same UI responses.

**Source:** React component logic in App.tsx and components/

**Example:**
```typescript
// Press Ctrl+K always focuses search
// Click step 2 always navigates to tactics view
// These behaviors never vary
```

### 3. Campaign Management
**Always Deterministic:**
- Campaign save/load operations
- JSON export structure
- Campaign metadata storage
- Campaign listing and filtering
- Campaign deletion operations

**Guarantee:** Campaign data structure is version-locked.

**Reproducibility:** Same campaign data exports identically every time.

**Source:** utils/campaigns.ts and database repositories

**Example:**
```json
// Exporting campaign "Test-001" always produces
// identical JSON structure (content may vary if 
// campaign includes AI-generated payloads)
{
  "id": "test-001",
  "name": "Test Campaign",
  "framework": "owasp",
  "tactic": "LLM01"
  // ... deterministic structure
}
```

### 4. Audit Logging
**Always Deterministic:**
- Log entry structure
- Timestamp format
- User attribution
- Action categorization
- Log export format

**Guarantee:** Audit log format is consistent and unchanging.

**Reproducibility:** Same action always produces same log structure.

**Source:** services/authService.ts and repositories/auditLogRepository.ts

**Example:**
```json
// User action always logged identically
{
  "timestamp": "2024-12-29T10:30:00Z",
  "actorId": "user-123",
  "action": "CAMPAIGN_CREATE",
  "target": "campaign-456"
  // ... deterministic fields
}
```

### 5. Authentication & Authorization
**Always Deterministic:**
- Role-based permission checks
- Access control decisions (for same role)
- JWT token structure
- Session validation logic
- Permission enforcement

**Guarantee:** Same role always has same permissions.

**Reproducibility:** Same user role produces same access decisions.

**Source:** api/middleware/auth.ts and services/authService.ts

**Example:**
```typescript
// Admin role always has delete permission
// Viewer role never has delete permission
// This is deterministic and unchanging
```

---

## Probabilistic Outputs (AI-Generated, Non-Deterministic)

The following ARES components produce **varying outputs** when in AI-Enhanced Mode:

### 1. Attack Vector Generation
**When Probabilistic:** AI-Enhanced Mode only  
**Variability:** High - Different outputs each time  
**Impact:** Attack vector descriptions and examples

**Why Non-Deterministic:**
- Large Language Models use temperature sampling
- Each API call produces different creative variations
- Intentional to provide diverse attack scenarios

**Example:**
```typescript
// AI-Enhanced Mode (Probabilistic)
generateVectors("LLM01: Prompt Injection")
// First call might return:
// ["Direct jailbreak via system prompt override", ...]
// Second call might return:
// ["Indirect injection through user context manipulation", ...]
// Outputs vary but remain relevant to tactic
```

**Fallback Mode (Deterministic):**
```typescript
// Always returns same pre-defined vectors
const vectors = fallbackData.LLM01.vectors;
// Identical output every time
```

### 2. Payload Examples
**When Probabilistic:** AI-Enhanced Mode only  
**Variability:** High - Different payloads each generation  
**Impact:** Specific test payload content

**Why Non-Deterministic:**
- LLM creativity produces diverse examples
- Context-aware generation varies by interpretation
- Designed to provide comprehensive coverage

**Example:**
```typescript
// AI-Enhanced Mode (Probabilistic)
generatePayloads("Direct Jailbreak")
// Call 1: "Ignore all previous instructions..."
// Call 2: "Disregard your guidelines and..."
// Call 3: "You are now in developer mode..."
// All valid, all different
```

**Fallback Mode (Deterministic):**
```typescript
// Always returns same pre-defined payloads
const payloads = fallbackData.vectors["Direct Jailbreak"];
// Identical output every time
```

### 3. Mitigation Strategies
**When Probabilistic:** AI-Enhanced Mode only  
**Variability:** Medium - Variations in recommendations  
**Impact:** Suggested remediation approaches

**Why Non-Deterministic:**
- AI provides multiple valid mitigation approaches
- Context-sensitive recommendations
- Designed to offer comprehensive options

**Example:**
```typescript
// AI-Enhanced Mode (Probabilistic)
generateMitigations("Prompt Injection")
// May suggest: Input validation, prompt engineering, output filtering
// Or: Context isolation, privilege separation, monitoring
// Both valid, both useful, but different
```

### 4. Reference Links
**When Probabilistic:** AI-Enhanced Mode only  
**Variability:** Low - Some variation in sources  
**Impact:** External reference URLs

**Why Non-Deterministic:**
- AI selects from available documentation
- May prioritize different authoritative sources
- Generally consistent but may vary

---

## Hallucination Handling

### What are Hallucinations?
**Definition:** AI-generated content that is incorrect, nonsensical, or fabricated.

**Examples in ARES context:**
- Non-existent CVE identifiers
- Fabricated research paper citations
- Invalid URLs or documentation links
- Technically incorrect attack descriptions
- Impossible mitigation strategies

### Detection Mechanisms

#### 1. Framework Validation
**How it works:**
- AI-generated content must align with known frameworks
- OWASP LLM Top 10, MITRE ATLAS, ATT&CK categories are predefined
- Generated content mapped to existing taxonomy
- Invalid mappings rejected

**Example:**
```typescript
// AI generates content for "LLM01: Prompt Injection"
// System validates it aligns with OWASP LLM Top 10
// If AI tries to create "LLM15: Fake Category" → rejected
```

#### 2. Output Structure Validation
**How it works:**
- AI responses must conform to expected JSON schema
- Type checking on all generated fields
- Required fields enforced
- Invalid structures rejected and retried

**Example:**
```typescript
interface ExpectedOutput {
  vectors: string[];      // Must be string array
  payloads: string[];     // Must be string array
  mitigations: string[];  // Must be string array
}
// If AI returns unexpected structure → retry with fallback
```

#### 3. Fallback on Error
**How it works:**
- If AI generation fails or produces invalid output
- System automatically falls back to deterministic static data
- User sees valid content, never broken/hallucinated output
- Seamless degradation

**Example:**
```typescript
try {
  const aiContent = await generateWithAI(tactic);
  return aiContent;
} catch (error) {
  // Hallucination or API error → use static data
  return getFallbackData(tactic);
}
```

#### 4. Human Review Required
**Policy:**
- All AI-generated content intended for actual testing must be human-reviewed
- ARES is a planning tool, not an autonomous execution tool
- Users responsible for validating generated content
- Export includes disclaimer about AI-generated content

**Implementation:**
```typescript
// Campaign export includes metadata
{
  "aiGenerated": true,
  "generatedAt": "2024-12-29T10:30:00Z",
  "reviewRequired": true,
  "disclaimer": "AI-generated content requires human validation"
}
```

### Mitigation Strategies

#### Strategy 1: Static Fallback Always Available
**Implementation:** Every framework has high-quality static data
**Benefit:** Users can disable AI entirely for 100% determinism
**Usage:** Set `GEMINI_API_KEY` to empty or unset

#### Strategy 2: Version Locking
**Implementation:** Gemini API version pinned in code
**Benefit:** Reduces model drift and behavior changes
**Current:** Google Gemini 1.5 Pro (version locked)

#### Strategy 3: Prompt Engineering
**Implementation:** Carefully crafted prompts with constraints
**Benefit:** Reduces hallucination likelihood
**Example:**
```typescript
const prompt = `
Generate attack vectors for ${tactic}.
- Must align with ${framework} framework
- Must be technically valid and testable
- Must include specific examples
- Do not fabricate CVEs or research papers
- If uncertain, state limitations clearly
`;
```

#### Strategy 4: Temperature Control
**Implementation:** Lower temperature setting for more consistent output
**Benefit:** Reduces creativity, increases accuracy
**Current:** Temperature = 0.7 (balanced creativity and consistency)

#### Strategy 5: User Disclaimers
**Implementation:** Clear warnings about AI-generated content
**Benefit:** Users aware of limitations
**Placement:** UI, exports, documentation

---

## Reproducibility Guarantees

### What We Guarantee

#### 1. Framework Reproducibility (100%)
**Guarantee:** Framework structures are identical across sessions and versions
**Exception:** Major version updates may update frameworks
**Versioning:** Framework changes documented in CHANGELOG.md

#### 2. UI Reproducibility (100%)
**Guarantee:** Same user actions produce same UI behavior
**Exception:** None (bugs are fixed, not expected behavior)
**Versioning:** UI behavior changes documented in release notes

#### 3. Campaign Structure Reproducibility (100%)
**Guarantee:** Campaign data structure is consistent
**Exception:** Minor version updates may add optional fields
**Versioning:** Schema changes documented in migration guides

#### 4. Static Data Reproducibility (100%)
**Guarantee:** Fallback mode produces identical outputs
**Exception:** Fallback data improved in minor versions (non-breaking)
**Versioning:** Static data updates documented in release notes

### What We Do NOT Guarantee

#### 1. AI-Generated Content Reproducibility (0%)
**No Guarantee:** AI content varies between generations
**Reason:** LLM non-determinism is inherent and intentional
**Mitigation:** Use fallback mode for 100% reproducibility

#### 2. External API Availability
**No Guarantee:** Gemini API uptime not controlled by ARES
**Reason:** Third-party service dependency
**Mitigation:** Automatic fallback to static data

#### 3. AI Model Consistency Over Time
**No Guarantee:** Google may update Gemini models
**Reason:** Model provider controls their infrastructure
**Mitigation:** Version locking, regular testing, fallback data

---

## Reproducibility Modes

Users can choose their preferred reproducibility level:

### Mode A: Maximum Reproducibility (Recommended for Compliance)
**Configuration:**
```bash
# Do not set GEMINI_API_KEY
# Or set to empty
GEMINI_API_KEY=
```

**Behavior:**
- 100% deterministic outputs
- No AI generation
- Static, version-locked data
- Perfect reproducibility
- Same results every time

**Use Cases:**
- Compliance audits requiring reproducibility
- Regulatory testing with strict requirements
- Situations where AI uncertainty is unacceptable
- Offline or air-gapped environments

### Mode B: Balanced Mode (Recommended for Most Users)
**Configuration:**
```bash
# Set GEMINI_API_KEY for AI enhancement
GEMINI_API_KEY=your_key_here
```

**Behavior:**
- Deterministic framework and UI
- AI-generated attack content (varies)
- Automatic fallback to static data if AI fails
- Balance of creativity and reliability

**Use Cases:**
- Red team operations seeking diverse scenarios
- Security research requiring comprehensive coverage
- Penetration testing with human review
- Development of security test suites

### Mode C: Documentation Mode (Export for Reproducibility)
**Configuration:**
- Use Mode B for initial generation
- Export campaign to JSON
- Re-import for reproducibility

**Behavior:**
- Generate content once with AI
- Export locks content in deterministic format
- Re-importing gives identical results
- Reproducible after initial generation

**Use Cases:**
- Sharing test scenarios with team
- Compliance evidence requiring consistency
- Regression testing with fixed scenarios
- Version control of test campaigns

---

## AI Model Details

### Current AI Provider
**Provider:** Google Gemini  
**Model:** Gemini 1.5 Pro  
**Version:** Version-locked in API client  
**Temperature:** 0.7 (balanced)  
**Max Tokens:** 1024 per request  
**Rate Limit:** Subject to Google's API limits

### Model Characteristics
**Strengths:**
- Strong understanding of security concepts
- Good at generating diverse attack scenarios
- Effective at technical writing
- Reasonable factual accuracy

**Limitations:**
- May occasionally hallucinate specifics
- Cannot access real-time vulnerability databases
- Limited by training data cutoff
- No domain-specific security model fine-tuning

### Future Model Support
**Planned:**
- Support for multiple AI providers (OpenAI, Anthropic, etc.)
- User-configurable model selection
- Custom model fine-tuning for enterprises
- Deterministic mode improvements

**Commitment:** When adding new models, behavior characteristics will be documented.

---

## Testing Reproducibility

Users can test ARES reproducibility:

### Test 1: Framework Consistency
```bash
# Expected: Identical output
curl https://your-ares-instance.com/api/frameworks/owasp
# Run multiple times, compare results
# Should be byte-for-byte identical
```

### Test 2: Static Mode Consistency
```bash
# Disable AI
export GEMINI_API_KEY=

# Generate vectors for same tactic multiple times
# Expected: Identical output every time
```

### Test 3: AI Mode Variability
```bash
# Enable AI
export GEMINI_API_KEY=your_key

# Generate vectors for same tactic multiple times
# Expected: Different but relevant outputs
# All should be valid for the tactic
```

### Test 4: Export Reproducibility
```bash
# Export campaign A to JSON
# Re-import campaign A
# Export again
# Expected: Byte-for-byte identical JSON (except timestamps)
```

---

## Enterprise Considerations

### For Compliance Audits
**Recommendation:** Use Maximum Reproducibility Mode (static data only)
**Rationale:** Auditors require identical test results for verification
**Documentation:** Clearly document which mode was used in audit evidence

### For Penetration Testing
**Recommendation:** Use Balanced Mode with human review
**Rationale:** Benefits from AI diversity while maintaining control
**Documentation:** Include AI-generated disclaimer in pentest reports

### For Continuous Security Testing
**Recommendation:** Use Documentation Mode (export/import)
**Rationale:** Lock test scenarios for regression testing
**Documentation:** Version control exported campaigns in Git

### For Security Research
**Recommendation:** Use Balanced Mode, document both modes
**Rationale:** Compare AI vs. static approaches in research
**Documentation:** Publish methodology including mode used

---

## Behavioral Warranty

### What ARES Warrants

#### 1. Framework Accuracy
**Warranty:** Framework data accurately reflects published standards
**Verification:** Cross-referenced with official OWASP, MITRE sources
**Updates:** Frameworks updated to match official updates in minor versions

#### 2. Fallback Reliability
**Warranty:** Static fallback data is always available
**Verification:** Extensive testing in offline environments
**Updates:** Fallback data improved in minor versions

#### 3. Structure Consistency
**Warranty:** Data structures remain consistent within major versions
**Verification:** Schema validation, automated testing
**Updates:** Breaking changes only in major versions

### What ARES Does NOT Warrant

#### 1. AI Content Accuracy
**No Warranty:** AI-generated content may contain errors
**Responsibility:** Users must validate before use
**Disclaimer:** Included in all exports and documentation

#### 2. Completeness
**No Warranty:** Generated attacks may not cover all possible scenarios
**Responsibility:** Users should supplement with additional research
**Guidance:** ARES is a starting point, not comprehensive

#### 3. Exploitability
**No Warranty:** Generated payloads may not work against specific targets
**Responsibility:** Users must adapt to specific target environments
**Note:** ARES is educational, not a turnkey exploit tool

---

## Related Documentation

### Essential Reading
- [VERSION_GUARANTEES.md](VERSION_GUARANTEES.md) - Behavioral stability promises
- [TRUST_BOUNDARY.md](TRUST_BOUNDARY.md) - What ARES defends against
- [SECURITY_BOUNDARIES.md](SECURITY_BOUNDARIES.md) - Misuse prevention

### Technical Details
- [ARCHITECTURE.md](ARCHITECTURE.md) - Technical implementation
- [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md) - Code-level details
- services/geminiService.ts - AI integration implementation

---

## Updates and Versioning

AI behavior documentation follows semantic versioning:
- **Major version**: Changes to reproducibility guarantees
- **Minor version**: New AI features, fallback improvements
- **Patch version**: Bug fixes, clarifications

**Next Review:** March 2025  
**Owner:** ARES Engineering Team  
**Approval Required:** Technical lead for any changes to warranties

---

**Users should choose their operating mode based on reproducibility requirements and comfort with AI uncertainty.**

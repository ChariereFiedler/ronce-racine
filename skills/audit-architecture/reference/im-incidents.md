# Section IM - Incident management (9 questions)

## Questions

- IM-01 - Incident classification and severity (P1-P4) (MUST)
- IM-02 - On-call organization and rotations (SHOULD)
- IM-03 - Incident detection (MTTD) (MUST)
- IM-04 - Incident resolution and MTTR (MUST)
- IM-05 - Communication during an incident (SHOULD)
- IM-06 - Incident Commander and War Room coordination (SHOULD)
- IM-07 - Blameless post-mortem and incident review (MUST)
- IM-08 - Metrics and continuous improvement (SHOULD)
- IM-09 - Incident response automation (SHOULD)

---

### IM-01 - Incident classification and severity (P1-P4) · Criticality: **MUST**

**Analyze:** Severity matrix, SLA per level, impact criteria, reclassification

**Verification commands:**
```bash
grep -ri "severity\|sévérité\|P1\|P2\|priority.*incident\|incident.*classif" . --include="*.md" --include="*.yml" 2>/dev/null | head -10
grep -ri "servicenow\|jira.*service\|freshservice" . --include="*.yml" --include="*.yaml" 2>/dev/null | head -5
```

**Check:** Documented P1-P4 matrix, response/resolution SLA, objective criteria, reclassification

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No classification. All handled the same way. No SLA. |
| 1 | Informal classification (critical/non-critical). Vague SLAs, not measured. |
| 2 | Documented P1-P4 matrix with SLAs. Impact criteria defined but inconsistently applied. |
| 3 | Systematic classification with objective criteria. SLAs met and measured. Reclassification in place. |
| 4 | ML-assisted automatic classification. Dynamic SLAs. Automatic correlation with business KPIs. |

---

### IM-02 - On-call organization and rotations · Criticality: **SHOULD**

**Analyze:** Fair rotation, redundant coverage, compensation, burnout prevention

**Verification commands:**
```bash
grep -ri "on.call\|astreinte\|pagerduty\|opsgenie\|grafana.*oncall" . --include="*.yml" --include="*.yaml" --include="*.md" 2>/dev/null | head -5
```

**Check:** Rotation schedule, primary/secondary, compensation, structured handoff, load metrics

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No formalized on-call. Ad-hoc response. Night incidents not handled. |
| 1 | Informal on-call. A few key people. No rotation. No compensation. |
| 2 | Documented on-call schedule with rotation. Primary on-call defined. Basic compensation. |
| 3 | Fair rotation with primary/secondary. Formalized compensation. Structured handoff. Load tracking. |
| 4 | Automated management (PagerDuty/OpsGenie). Fatigue metrics. Auto-adjustment. Labor-law compliance. |

---

### IM-03 - Incident detection (MTTD) · Criticality: **MUST**

**Analyze:** Synthetic monitoring, RUM, anomaly detection, automatic correlation

**Verification commands:**
```bash
grep -ri "mttd\|mean.time.to.detect\|synthetic.*monitor\|rum\|anomaly.detect" . --include="*.md" --include="*.yml" 2>/dev/null | head -5
grep -ri "checkly\|datadog.*synthetic\|pingdom\|new.relic\|dynatrace" . --include="*.yml" --include="*.yaml" --include="*.tf" 2>/dev/null | head -5
```

**Check:** MTTD measured, proactive monitoring (synthetic + RUM), anomaly detection, cross-service correlation

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | Detection by users. No proactive monitoring. MTTD unknown. |
| 1 | Basic monitoring. Poorly configured alerts. MTTD > 30 min. |
| 2 | Monitoring of critical services. Threshold alerts. MTTD 10-30 min. Basic synthetic monitoring. |
| 3 | Complete monitoring (infra, application, business). MTTD < 10 min for P1. Synthetic + RUM. |
| 4 | ML anomaly detection. MTTD < 5 min for P1. Cross-service correlation. Predictive detection. |

---

### IM-04 - Incident resolution and MTTR · Criticality: **MUST**

**Analyze:** Escalation procedures, runbooks, diagnostic tooling, fast rollback

**Verification commands:**
```bash
grep -ri "mttr\|mean.time.to.recover\|mean.time.to.resolve" . --include="*.md" --include="*.yml" 2>/dev/null | head -5
```

**Check:** MTTR measured, automatic escalation, up-to-date runbooks, rollback < 15 min

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | Improvised resolution. No MTTR measurement. Chaotic escalation. |
| 1 | Informal escalation. MTTR estimated at several hours. A few runbooks. |
| 2 | Documented escalation (L1/L2/L3). MTTR measured (2-4h for P1). Rollback possible but manual. |
| 3 | Automatic escalation. MTTR < 1h for P1. Complete runbooks. Rollback < 15 min. Centralized diagnostics. |
| 4 | MTTR < 30 min for P1. Auto-remediation of known incidents. AI-assisted diagnostics. Automatic rollback. |

---

### IM-05 - Communication during an incident · Criticality: **SHOULD**

**Analyze:** Status page, templates, cadenced communication, dedicated channels, NIS2/GDPR

**Verification commands:**
```bash
grep -ri "status.page\|incident.*communic\|war.room\|incident.*template" . --include="*.md" --include="*.yml" 2>/dev/null | head -5
```

**Check:** Status page, templates per severity/phase, cadenced updates (15-30 min for P1), dedicated channels

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No structured communication. Customers find out on their own. |
| 1 | Ad-hoc communication by email/Slack. No templates. Customers informed late. |
| 2 | Status page in place. Basic templates. Internal communication via a dedicated channel. |
| 3 | Cadenced communication (15-30 min for P1). Templates per severity. Proactive customer notification. |
| 4 | Automated multi-channel communication. Dynamic templates. Regulatory compliance (NIS2, GDPR). |

---

### IM-06 - Incident Commander and War Room coordination · Criticality: **SHOULD**

**Analyze:** Roles (IC, Tech Lead, Communication Lead, Scribe), war room, rotation, training

**Verification commands:**
```bash
grep -ri "incident.commander\|war.room\|incident.*role\|game.day" . --include="*.md" --include="*.yml" 2>/dev/null | head -5
```

**Check:** IC role defined, automated war room, IC rotation on long incidents, game days

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No defined role. Disorganized response. Delayed decisions. |
| 1 | Informal "lead". No separation between coordination and resolution. |
| 2 | IC role defined and documented. War Room for P1. Basic IC checklist. |
| 3 | Trained IC with rotation. Complementary roles (Tech Lead, Comms, Scribe). Quarterly game days. |
| 4 | Mature IC program with certification. Automatic rotation. Coordination metrics. Monthly simulations. |

---

### IM-07 - Blameless post-mortem and incident review · Criticality: **MUST**

**Analyze:** Structured template, blameless culture, collective review, action tracking, knowledge base

**Verification commands:**
```bash
find docs/ -name "*postmortem*" -o -name "*post-mortem*" -o -name "*post_mortem*" -o -name "*incident-review*" 2>/dev/null
grep -ri "blameless\|post.mortem\|root.cause\|5.why\|retrospective.*incident" . --include="*.md" 2>/dev/null | head -5
```

**Check:** Standardized template, blameless culture, actions with owner/deadline, knowledge base

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No post-mortem. Incidents forgotten. Frequent recurrence. |
| 1 | Occasional post-mortem. Free-form. Actions rarely followed up. Tendency to blame. |
| 2 | Standardized template. Systematic for P1/P2. Actions with an owner. Blameless culture declared. |
| 3 | Systematic blameless for P1/P2/P3. Collective review. Actions in the backlog. Knowledge base. 5 Whys. |
| 4 | Blameless culture ingrained. Cross-team sharing. Recurrence metrics. Root-cause trend analysis. |

---

### IM-08 - Metrics and continuous improvement · Criticality: **SHOULD**

**Analyze:** DORA metrics, MTTD/MTTR/MTBF, recurrence, dashboards, objectives

**Verification commands:**
```bash
grep -ri "dora\|mtbf\|mttd\|mttr\|change.failure.rate\|incident.*metric" . --include="*.md" --include="*.yml" 2>/dev/null | head -5
```

**Check:** Metrics collected (MTTD, MTTR, MTBF, recurrence), real-time dashboard, objectives, benchmarking

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No metrics collected. Improvement based on impressions. |
| 1 | Basic counting. No MTTD/MTTR. Manual reporting. |
| 2 | MTTD and MTTR measured for P1/P2. Basic dashboard. Monthly report. |
| 3 | Complete metrics. Real-time dashboards. Objectives per metric. Trend analysis. |
| 4 | DORA metrics integrated. Incident/deployment correlation. Predictive detection. External benchmarking. |

---

### IM-09 - Incident response automation · Criticality: **SHOULD**

**Analyze:** Auto-remediation, automated runbooks, ChatOps, self-healing, guardrails

**Verification commands:**
```bash
grep -ri "auto.remediat\|self.healing\|chatops\|rundeck\|stackstorm\|shoreline" . --include="*.yml" --include="*.yaml" --include="*.ts" --include="*.md" 2>/dev/null | head -5
grep -ri "livenessProbe\|readinessProbe\|auto.*restart\|auto.*scale" . --include="*.yml" --include="*.yaml" 2>/dev/null | head -5
```

**Check:** Auto-remediation of known incidents, automated runbooks, ChatOps, self-healing, guardrails

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | Everything manual. Each incident = SSH + manual commands. |
| 1 | A few remediation scripts. Manual execution. No guardrails. |
| 2 | Semi-automated runbooks for recurring P1s. Basic Kubernetes probes. Limited ChatOps. |
| 3 | Auto-remediation of known incidents. Automated runbooks for >50% of recurring ones. ChatOps. Audit trail. |
| 4 | Self-healing infrastructure. Auto-remediation of >80% of recurring ones. Smart orchestration. On-call load reduced >60%. |

---

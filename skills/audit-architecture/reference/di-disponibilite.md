# Section DI — Availability & SLA (9 questions)

## Questions

- DI-01 — RPO definition (Recovery Point Objective) (MUST)
- DI-02 — RTO definition (Recovery Time Objective) (MUST)
- DI-03 — Target availability (99.5%, 99.9%) (MUST)
- DI-03a — Cost of the availability level (COULD)
- DI-04 — Qualifying critical SLOs + error budget (MUST)
- DI-04a — Error budget usage (SHOULD)
- DI-05 — SLI dashboard (SHOULD)
- DI-06 — Alerts on breaches / SLO overruns (MUST)
- DI-07 — Automated export of actual SLAs (SHOULD)
- DI-08 — Shared dashboard (status page) (SHOULD)
- DI-09 — External verification (synthetic monitoring) (SHOULD)

---

### DI-01 — RPO definition (Recovery Point Objective) · Criticality: **MUST**

**Analyze:** RPO per data class, continuous backup, synchronous replication, tiered RPO

**Verification commands:**
```bash
grep -ri "rpo\|recovery.point\|data.loss.*accept" . --include="*.md" --include="*.yml" 2>/dev/null | head -5
grep -ri "continuous.backup\|wal.*shipping\|binlog.*replication\|synchronous.*replication" . --include="*.yml" --include="*.tf" 2>/dev/null | head -5
```

**Check:** RPO defined per data class, backup/replication aligned, tested

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | RPO not defined. Unknown acceptable data loss. |
| 1 | Implicit RPO = last backup (often 24h). |
| 2 | RPO defined but not by data criticality. |
| 3 | RPO per data class. Backup/replication aligned. Tested. |
| 4 | RPO = 0 for critical data. Synchronous replication. Validated continuously. |

---

### DI-02 — RTO definition (Recovery Time Objective) · Criticality: **MUST**

**Analyze:** Auto-failover, multi-region deployment, runbooks, DR drills

**Verification commands:**
```bash
grep -ri "rto\|recovery.time\|failover\|multi.az\|multi.region" . --include="*.md" --include="*.yml" --include="*.tf" 2>/dev/null | head -5
```

**Check:** RTO per criticality, auto-failover, DR drills validating the RTO

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | RTO not defined. Recovery "when it's ready". |
| 1 | Implicit RTO based on past experience. |
| 2 | RTO defined globally. Not tested regularly. |
| 3 | RTO per service criticality. Tested quarterly. SLA aligned. |
| 4 | Aggressive RTO (<15min) with auto-failover. Tested monthly. Compliance tracked. |

---

### DI-03 — Target availability (99.5%, 99.9%) · Criticality: **MUST**

**Analyze:** Contractual SLA, error budgets, multi-9s architecture, availability zones

**Verification commands:**
```bash
grep -ri "sla\|99\.\|availability\|uptime\|error.budget" . --include="*.md" --include="*.yml" 2>/dev/null | head -5
grep -ri "multi.az\|availability.zone\|active.active\|active.passive" . --include="*.yml" --include="*.tf" 2>/dev/null | head -5
```

**Check:** Target defined (99.x%), automatic measurement, contractual SLA, error budgets

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No availability objective defined. |
| 1 | Informal objective ("we aim for the max"). |
| 2 | Target defined (e.g. 99.5%). No systematic measurement. |
| 3 | Contractual SLA with penalties. Automatic measurement. Monthly review. |
| 4 | Multi-9s with a suitable architecture. Error budgets. Continuous SLA compliance. |

---

### DI-03a — Cost of the availability level · Criticality: **COULD**

**Condition:** Evaluate if DI-03 >= 2

**Analyze:** TCO analysis, risk quantification, cost-benefit, right-sizing

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | Not evaluated. |
| 1 | Rough estimate. |
| 2 | TCO per availability level. Trade-offs documented. |
| 3 | ROI analysis. Cost-benefit per additional 9. |
| 4 | Dynamic cost optimization. Right-sizing availability per service. |

---

### DI-04 — Qualifying critical SLOs + error budget · Criticality: **MUST**

**Analyze:** SLIs, SLOs, error budget policies, burn rate alerting

**Verification commands:**
```bash
grep -ri "slo\|sli\|error.budget\|burn.rate\|service.level" . --include="*.yml" --include="*.yaml" --include="*.md" --include="*.ts" 2>/dev/null | head -10
```

**Check:** SLOs defined with measurable SLIs, error budgets, impact on releases

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No SLO defined. No notion of error budget. |
| 1 | Informal SLO ("we want it to work"). |
| 2 | SLOs defined for critical services. No formalized error budget. |
| 3 | SLOs with error budgets. Alerts when the budget is consumed. Impact on releases. |
| 4 | SLO-driven development. Error budget policies. Automated release gates. |

---

### DI-04a — Error budget usage · Criticality: **SHOULD**

**Condition:** Evaluate if DI-04 >= 3

**Analyze:** Release freeze, velocity adjustment, error budget alerts, blameless post-mortems

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | Error budget ignored. |
| 1 | Tracked but no automatic action. |
| 2 | Release freeze if the budget is exhausted. |
| 3 | Reliability vs features focus based on the budget. Weekly review. |
| 4 | Automated velocity adjustment. Risk-based deployment decisions. |

---

### DI-05 — SLI dashboard · Criticality: **SHOULD**

**Analyze:** Grafana, Datadog, real-time dashboards, drill-down, executive summaries

**Verification commands:**
```bash
grep -ri "grafana\|datadog\|dashboard\|prometheus" . --include="*.yml" --include="*.yaml" --include="*.tf" 2>/dev/null | head -10
find . -name "*dashboard*" -o -name "*grafana*" 2>/dev/null | head -5
```

**Check:** Centralized dashboard, real-time, drill-down per service, executive views

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No SLI dashboard. |
| 1 | Metrics scattered across different tools. |
| 2 | Centralized dashboard with the main SLIs. Manual refresh. |
| 3 | Real-time dashboard with history. Drill-down per service. Accessible to all. |
| 4 | Executive + detailed views. Predictive SLI. Correlation with incidents. |

---

### DI-06 — Alerts on breaches / SLO overruns · Criticality: **MUST**

**Analyze:** Multi-window alerting, burn rate alerts, alert correlation, escalation policies

**Verification commands:**
```bash
grep -ri "alert\|burn.rate\|escalat\|pagerduty\|opsgenie" . --include="*.yml" --include="*.yaml" --include="*.tf" 2>/dev/null | head -10
```

**Check:** SLO-based alerts (not just infra), burn rate alerts, escalation policies

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No SLO alerts. Discovered through customer complaints. |
| 1 | Basic alerts on infra metrics (CPU, memory). |
| 2 | Alerts on the main SLIs. Fixed thresholds. |
| 3 | Multi-window alerting. Burn rate alerts. Actionable notifications. |
| 4 | Predictive alerting. Alert correlation. Automated initial response. |

---

### DI-07 — Automated export of actual SLAs · Criticality: **SHOULD**

**Analyze:** Automated SLA reporting, audit trail, customer-facing reports, compliance dashboards

**Verification commands:**
```bash
grep -ri "sla.*report\|uptime.*report\|availability.*report" . --include="*.md" --include="*.yml" 2>/dev/null | head -5
```

**Check:** Automated SLA reporting pipeline, auditability, customer reports

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No automated SLA measurement. |
| 1 | Manual calculation from logs/incidents. |
| 2 | SLA calculation script. Manual monthly run. |
| 3 | Automated SLA reporting pipeline. History retained. Auditable. |
| 4 | Real-time SLA calculation. Customer-facing reports. Contractual compliance proof. |

---

### DI-08 — Shared dashboard (status page) · Criticality: **SHOULD**

**Analyze:** Statuspage.io, Cachet, Instatus, incident communication, maintenance windows

**Verification commands:**
```bash
grep -ri "statuspage\|cachet\|instatus\|status.page" . --include="*.yml" --include="*.yaml" --include="*.md" --include="*.tf" 2>/dev/null | head -5
```

**Check:** Public status page, incident communication, planned maintenance, uptime history

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No sharing with customers. |
| 1 | Reports sent on request. |
| 2 | Basic status page (up/down). |
| 3 | Detailed status page with history. Documented incidents. Planned maintenance. |
| 4 | Customer portal with a personalized SLA dashboard. Metrics access API. |

---

### DI-09 — External verification (synthetic monitoring) · Criticality: **SHOULD**

**Analyze:** Pingdom, Datadog Synthetics, Checkly, RUM, third-party validation

**Verification commands:**
```bash
grep -ri "synthetic\|pingdom\|uptime.robot\|checkly\|datadog.*synthetic\|rum\|real.user.monitor" . --include="*.yml" --include="*.yaml" --include="*.ts" --include="*.tf" 2>/dev/null | head -5
```

**Check:** Multi-region synthetic checks, user journey simulation, RUM + synthetic, third-party validation

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No external monitoring. |
| 1 | Basic ping from an external point. |
| 2 | Multi-region synthetic checks. Latency metrics. Alerts. |
| 3 | Simulated user journeys. RUM + synthetic combined. SLA evidence. |
| 4 | Global synthetic monitoring. Third-party SLA verification. Competitive benchmarking. |

---

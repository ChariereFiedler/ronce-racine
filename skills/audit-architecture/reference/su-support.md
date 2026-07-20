# Section SU — Support & Operability (8 questions)

## Questions

- SU-01 — Runbooks available (SHOULD)
- SU-01a — Runbook maintenance (SHOULD)
- SU-02 — Clear escalation (level 1, 2, 3) (SHOULD)
- SU-03 — RACI defined (SHOULD)
- SU-04 — Install & startup scripts (SHOULD)
- SU-04a — Dev environment setup time (SHOULD)
- SU-05 — Automated onboarding (sandbox) (COULD)
- SU-05a — Measuring onboarding effectiveness (COULD)

---

### SU-01 — Runbooks available · Criticality: **SHOULD**

**Analyze:** `docs/runbooks/`, `docs/ops/` folders, operational wiki, runbook automation

**Verification commands:**
```bash
find docs/ -name "*runbook*" -o -name "*ops*" -o -name "*deploy*" -o -name "*playbook*" 2>/dev/null
grep -ri "runbook\|playbook\|operational.procedure" . --include="*.md" 2>/dev/null | head -5
```

**Check:** Structured runbooks, decision trees, auto-remediation, runbooks as code

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No runbooks. Resolution depends on individual expertise. |
| 1 | Informal notes in a wiki. Not structured. |
| 2 | Runbooks for frequent incidents. Standardized format. Partially up to date. |
| 3 | Complete runbooks with decision trees. Tested. Versioned. Quarterly review. |
| 4 | Runbooks as code. Auto-remediation integrated. Resolution-time metrics. Continuous improvement. |

---

### SU-01a — Runbook maintenance · Criticality: **SHOULD**

**Condition:** Evaluate if SU-01 >= 2

**Analyze:** Post-mortem feedback, runbook testing, drift detection, ownership

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No maintenance. Stale runbooks. |
| 1 | Updated when someone spots an error. |
| 2 | Scheduled annual review. Owner identified. |
| 3 | Mandatory update after each incident. Post-mortem feedback loop. |
| 4 | Runbooks tested automatically. Drift detection. Gamification for contributions. |

---

### SU-02 — Clear escalation (level 1, 2, 3) · Criticality: **SHOULD**

**Analyze:** L1/L2/L3 tiering, SLA per level, smart routing, on-call rotation

**Verification commands:**
```bash
find docs/ -name "*incident*" -o -name "*escalad*" -o -name "*on-call*" -o -name "*astreinte*" 2>/dev/null
grep -ri "escalat\|on.call\|pagerduty\|opsgenie\|L1\|L2\|L3" . --include="*.md" --include="*.yml" 2>/dev/null | head -5
```

**Check:** Documented escalation process, SLA per level, automatic alerts, on-call rotation

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No escalation process. Everyone contacts everyone. |
| 1 | Informal escalation. Contacts known to the old-timers. |
| 2 | Documented escalation matrix. Not always followed. |
| 3 | Escalation process with SLA per level. Automatic alerts. Escalation-time metrics. |
| 4 | Intelligent routing. Auto-escalation based on symptoms. 24/7 coverage. PagerDuty/OpsGenie integrated. |

---

### SU-03 — RACI defined · Criticality: **SHOULD**

**Analyze:** RACI matrix, single point of contact, cross-training, succession planning

**Verification commands:**
```bash
grep -ri "raci\|responsible\|accountable\|consulted\|informed\|bus.factor\|point.of.contact" . --include="*.md" 2>/dev/null | head -5
```

**Check:** Documented RACI, single point of contact per domain, cross-training, succession planning

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No RACI. Fuzzy responsibilities. |
| 1 | Responsibilities known informally. Not documented. |
| 2 | RACI documented for the main processes. Not always up to date. |
| 3 | Complete RACI. Reviewed on team changes. Single point of contact for each domain. |
| 4 | Dynamic RACI. Integrated into tools (Jira, PagerDuty). Succession planning. Cross-training. |

---

### SU-04 — Install & startup scripts · Criticality: **SHOULD**

**Analyze:** IaC (Terraform, Ansible), dev containers, GitOps, one-click setup

**Verification commands:**
```bash
ls Makefile docker-compose*.yml Dockerfile devcontainer.json .devcontainer/ 2>/dev/null
find . -name "*.tf" -o -name "*.ansible.*" -o -name "devcontainer.json" 2>/dev/null | head -5
grep -ri "make setup\|npm run dev\|bootstrap" Makefile README.md 2>/dev/null | head -5
```

**Check:** Automated install scripts, IaC, dev containers, GitOps

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | Manual install. Procedures in the experts' heads. |
| 1 | Basic README. Manual steps. Often incomplete. |
| 2 | Working install scripts. Docker compose. Occasionally tested. |
| 3 | Infrastructure as Code (Terraform, Ansible). Reproducible environment. CI/CD for infra. |
| 4 | GitOps. Self-service provisioning. Dev containers. One-click deployment. Chaos testing of infra. |

---

### SU-04a — Dev environment setup time · Criticality: **SHOULD**

**Condition:** Evaluate if SU-04 >= 2

**Analyze:** One-click setup, pre-built containers, cloud dev environments, daily validation

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | Several days. Depends on help from colleagues. |
| 1 | One day with documentation. Frequent problems. |
| 2 | A few hours. Partial automation. |
| 3 | <1 hour. Reliable scripts. Troubleshooting guide. |
| 4 | <15 minutes. Pre-configured dev containers. Self-service. Validated daily. |

---

### SU-05 — Automated onboarding (sandbox) · Criticality: **COULD**

**Analyze:** Structured journey, dedicated sandbox, mentoring program, time-to-productivity

**Verification commands:**
```bash
find docs/ -name "*onboard*" -o -name "*getting-started*" -o -name "*new-dev*" 2>/dev/null
grep -ri "onboarding\|getting.started\|sandbox\|new.developer" . --include="*.md" 2>/dev/null | head -5
```

**Check:** Structured journey, dedicated sandbox, mentoring, time-to-first-commit measured

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No structured onboarding. Shadow learning. |
| 1 | Onboarding checklist. No dedicated environment. |
| 2 | Sandbox with test data. Onboarding documentation. |
| 3 | Interactive onboarding journey. Structured mentoring. Feedback loop. |
| 4 | Self-paced learning platform. Internal certification. Productivity metrics. Time-to-productivity tracked. |

---

### SU-05a — Measuring onboarding effectiveness · Criticality: **COULD**

**Condition:** Evaluate if SU-05 >= 2

**Analyze:** Time-to-first-commit, ramp-up velocity, onboarding NPS, A/B testing

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No measurement. Subjective impression. |
| 1 | Informal feedback from newcomers. |
| 2 | Post-onboarding survey. Identification of friction points. |
| 3 | Time-to-first-commit measured. Continuous improvement based on feedback. |
| 4 | Productivity metrics over 90 days. A/B testing of the journeys. Onboarding NPS. |

---

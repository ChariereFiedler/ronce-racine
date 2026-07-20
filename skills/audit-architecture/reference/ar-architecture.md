# Section AR — Architecture, Specification & Deployment (11 questions)

## Questions

- AR-01 — Architecture decision documentation (SHOULD)
- AR-01a — Architecture decision process (SHOULD)
- AR-02 — Technical debt traceability (SHOULD)
- AR-03 — Multi-level architecture documentation (SHOULD)
- AR-04 — Blue/Green or Canary (SHOULD)
- AR-04a — Canary promotion criteria (COULD)
- AR-05 — Feature toggles / Feature flags (SHOULD)
- AR-06 — Automated rollback on failure (MUST)
- AR-07 — Backward compatibility (SHOULD)
- AR-08 — Documented progressive deprecation (SHOULD)
- AR-09 — Semantic versioning (SHOULD)

---

### AR-01 — Architecture decision documentation · Criticality: **SHOULD**

**Analyze:** `docs/adr/`, `doc/architecture/` folders, `*.adr.md` files, architecture README

**Verification commands:**
```bash
find . -path "*/adr/*" -o -name "*.adr.md" 2>/dev/null
find docs/ -name "*.md" 2>/dev/null | head -10
grep -ri "architecture decision\|ADR" . --include="*.md" 2>/dev/null | head -5
```

**Check:** ADRs present and up to date, structured format (context, decision, consequences), traceable history, link to the code

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No documentation. Decisions in the architects' heads. |
| 1 | A few archived emails/Slack messages. Hard to find. |
| 2 | Wiki with the main decisions. No standard format. |
| 3 | Systematic ADRs. Context, options, decision, consequences. |
| 4 | ADRs versioned with the code. Linked to PRs. Searchable. Architecture fitness functions. |

---

### AR-01a — Architecture decision process · Criticality: **SHOULD**

**Condition:** Evaluate if AR-01 >= 2

**Analyze:** RFC process, architecture review board, trade-off analysis documentation

**Verification commands:**
```bash
grep -ri "RFC\|request for comments\|architecture review" . --include="*.md" 2>/dev/null | head -5
find . -name "*.rfc.*" -o -name "*proposal*" 2>/dev/null | head -5
```

**Check:** Formalized decision process (RFC), type 1/type 2 decision distinction, documented trade-off analysis

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | Ad-hoc decisions by whoever. |
| 1 | Decisions made by seniors. No formal process. |
| 2 | RFC for major decisions. |
| 3 | Architecture review board. Documented decision criteria. Trade-off analysis. |
| 4 | Lightweight architecture governance. Automated compliance checks. Evolutionary architecture. |

---

### AR-02 — Technical debt traceability · Criticality: **SHOULD**

**Analyze:** TODO/FIXME in the code, debt backlog, SonarQube, debt metrics

**Verification commands:**
```bash
grep -rn "TODO\|FIXME\|HACK\|TECH.DEBT" . --include="*.ts" --include="*.js" --include="*.php" --include="*.py" 2>/dev/null | wc -l
grep -ri "sonarqube\|codeclimate\|technical.debt" . --include="*.yml" --include="*.yaml" --include="*.json" 2>/dev/null | head -5
```

**Check:** Technical debt backlog, prioritization, dedicated budget (20% of the sprint), automated detection

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No tracking. Debt invisible until the incident. |
| 1 | TODO/FIXME in the code. No consolidated view. |
| 2 | Technical debt backlog. Occasional prioritization. |
| 3 | Debt categorized and scored. Dedicated budget (20% of the sprint). Reduction metrics. |
| 4 | Automated debt detection (SonarQube). Technical debt ratio tracked. Data-driven investment decisions. |

---

### AR-03 — Multi-level architecture documentation · Criticality: **SHOULD**

**Analyze:** C4 diagrams, Structurizr, Mermaid, architecture documentation

**Verification commands:**
```bash
find . -name "*.puml" -o -name "*.mmd" -o -name "*.structurizr" -o -name "*c4*" 2>/dev/null
grep -ri "c4 model\|context diagram\|container diagram" . --include="*.md" 2>/dev/null | head -5
```

**Check:** C1 (Context) and C2 (Container) levels documented, diagrams up to date, living documentation

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No architecture documentation. |
| 1 | A global diagram. Often stale. |
| 2 | C4 model or equivalent. Context and Container levels documented. |
| 3 | Complete documentation (Context, Container, Component). Generated from the code where possible. |
| 4 | Living documentation. Auto-updated from code. Interactive diagrams. Architecture as code. |

---

### AR-04 — Blue/Green or Canary · Criticality: **SHOULD**

**Analyze:** Deployment strategy, Kubernetes configs, Argo Rollouts, feature flags

**Verification commands:**
```bash
grep -ri "blue.green\|canary\|rolling.update\|progressive.delivery" . --include="*.yml" --include="*.yaml" --include="*.tf" 2>/dev/null | head -5
grep -ri "argo.rollout\|flagger\|feature.flag" . 2>/dev/null | head -5
```

**Check:** Progressive deployment strategy, fast rollback, feature flags

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | Direct deploy to prod. Big bang. Downtime accepted. |
| 1 | Basic rolling update. No fast rollback. |
| 2 | Blue/Green with manual switch. Post-deploy smoke tests. |
| 3 | Progressive canary deployment (1%, 10%, 50%, 100%). Health metrics. Auto-rollback. |
| 4 | Progressive delivery. Feature flags + canary. Traffic mirroring. Integrated A/B testing. |

---

### AR-04a — Canary promotion criteria · Criticality: **COULD**

**Condition:** Evaluate if AR-04 >= 2

**Analyze:** Promotion metrics, analysis templates, SLO-based promotion

**Verification commands:**
```bash
grep -ri "analysis.template\|promotion\|canary.metric" . --include="*.yml" --include="*.yaml" 2>/dev/null | head -5
```

**Check:** Objective promotion criteria, statistical significance, multi-metric analysis

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | Manual decision based on gut feeling. |
| 1 | Waiting a fixed delay with no visible error. |
| 2 | Basic metrics (error rate, latency) compared to the baseline. |
| 3 | SLO compliance automatically checked. Statistical significance. |
| 4 | ML-based promotion. Multi-metric analysis. Automated experimentation platform. |

---

### AR-05 — Feature toggles / Feature flags · Criticality: **SHOULD**

**Analyze:** LaunchDarkly, Unleash, config flags, kill switches

**Verification commands:**
```bash
grep -ri "feature.flag\|feature.toggle\|launchdarkly\|unleash\|flipt" . --include="*.ts" --include="*.js" --include="*.php" --include="*.py" --include="*.yml" 2>/dev/null | head -10
grep -ri "isEnabled\|isFeatureOn\|flag_enabled" . --include="*.ts" --include="*.js" --include="*.php" 2>/dev/null | head -5
```

**Check:** Feature flag system, kill switches, targeting by segment, flag hygiene

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No feature flags. Code deployed = feature active. |
| 1 | Flags via config files. Restart required to change. |
| 2 | Feature flag system (LaunchDarkly, Unleash). Toggle without redeployment. |
| 3 | Flags per user/segment. A/B testing possible. Audit of active flags. |
| 4 | Feature management platform. Kill switches. Stale flag detection. Flag-as-code. |

---

### AR-06 — Automated rollback on failure · Criticality: **MUST**

**Analyze:** Rollback mechanisms, health-based rollback, blue/green, database rollback

**Verification commands:**
```bash
grep -ri "rollback\|auto.rollback\|health.check.*rollback" . --include="*.yml" --include="*.yaml" --include="*.tf" 2>/dev/null | head -5
grep -ri "expand.contract\|migration.*rollback" . --include="*.md" 2>/dev/null | head -5
```

**Check:** Metric-driven automated rollback, instant rollback via blue/green, database rollback strategy

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No rollback. Fix forward only. |
| 1 | Manual rollback possible but untested. Stressful. |
| 2 | Scripted rollback. Tested in staging. < 15 min in prod. |
| 3 | Auto-rollback on health metrics. Tested monthly. < 5 min. |
| 4 | Instant rollback via blue/green. Zero-downtime. Automated testing of rollback. Database migration rollback. |

---

### AR-07 — Backward compatibility · Criticality: **SHOULD**

**Analyze:** Contract testing, schema evolution, API versioning, expand-contract

**Verification commands:**
```bash
grep -ri "pact\|contract.test\|backward.compat\|breaking.change" . --include="*.ts" --include="*.js" --include="*.php" --include="*.yml" 2>/dev/null | head -5
ls **/openapi* **/swagger* 2>/dev/null
grep -ri "v1\|v2\|api.version\|deprecat" . --include="*.ts" --include="*.php" --include="*.yml" 2>/dev/null | head -5
```

**Check:** Backward compatibility policy, contract tests, API versioning strategy, deprecation warnings

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | Frequent breaking changes. No compatibility guarantee. |
| 1 | "Best effort" compatibility. Breaking changes documented after the fact. |
| 2 | Defined compatibility policy. Breaking changes announced in advance. |
| 3 | Backward compatibility by design. Contract tests. Deprecation warnings. |
| 4 | API versioning strategy. Compatibility matrix. Automated breaking change detection. |

---

### AR-08 — Documented progressive deprecation · Criticality: **SHOULD**

**Analyze:** Sunset headers, deprecation policy, usage analytics, migration guides

**Verification commands:**
```bash
grep -ri "deprecated\|sunset\|end.of.life\|migration.guide" . --include="*.ts" --include="*.php" --include="*.md" 2>/dev/null | head -5
```

**Check:** Formal deprecation policy, sunset headers (RFC 8594), usage analytics, migration guides

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | Features removed without notice. |
| 1 | Ad-hoc communication to impacted customers. |
| 2 | Deprecation policy (e.g. 6-month warning). Documented. |
| 3 | Deprecation warnings in API responses. Migration guides. Transition support. |
| 4 | Automated deprecation tracking. Usage analytics for timing. Customer communication automation. |

---

### AR-09 — Semantic versioning · Criticality: **SHOULD**

**Analyze:** SemVer, conventional commits, changelog, release automation

**Verification commands:**
```bash
grep -ri "semantic.release\|conventional.commit\|semver\|changelog" . --include="*.json" --include="*.yml" --include="*.yaml" 2>/dev/null | head -5
cat package.json 2>/dev/null | grep version
cat CHANGELOG.md 2>/dev/null | head -20
```

**Check:** SemVer applied, conventional commits, automated changelog, breaking change detection

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No versioning or arbitrary versions. |
| 1 | Numeric versions but no clear semantics. |
| 2 | SemVer applied. MAJOR.MINOR.PATCH. Changelog. |
| 3 | Strict SemVer. Automated version bump. Breaking change detection. |
| 4 | CalVer or SemVer depending on context. Release train. Automated release notes. Automated dependency updates. |

---

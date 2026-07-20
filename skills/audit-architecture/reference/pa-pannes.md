# Section PA — Fault and interruption tolerance (15 questions)

## Questions

- PA-01 — API error handling (API unreachable) (MUST)
- PA-02 — Documentation of expected behaviors (SHOULD)
- PA-03 — Configurable retry policy (MUST)
- PA-04 — Circuit breaker to avoid saturation (MUST)
- PA-05 — Centralized processing pause (SHOULD)
- PA-06 — Safe shutdown mode (MUST)
- PA-07 — Controlled recovery after restart (MUST)
- PA-08 — Connector/API isolation mechanism (SHOULD)
- PA-09 — Connector notification strategy (SHOULD)
- PA-12 — Degraded mode (cache, replication, fallback) (MUST)
- PA-13 — Watch on external API changelog/versioning (SHOULD)
- PA-18 — DB migration tests (MUST)
- PA-19 — DB backup plan (MUST)
- PA-20 — DB rollback playbook (SHOULD)
- PA-21 — DB rollback tests (SHOULD)

---

### PA-01 — API error handling (API unreachable) · Criticality: **MUST**

**Analyze:** Retry, circuit breaker, fallback, dead letter queue, error handling

**Verification commands:**
```bash
grep -ri "circuit.breaker\|retry\|backoff\|timeout\|fallback" . --include="*.ts" --include="*.js" --include="*.php" 2>/dev/null | head -10
grep -ri "resilience4j\|polly\|opossum\|hystrix" . 2>/dev/null | head -5
```

**Check:** Timeouts configured, retry with backoff, circuit breaker, graceful degradation, DLQ

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No error handling. The app crashes or returns unhandled errors. |
| 1 | Basic handling (generic try/catch). Technical error messages exposed. No retry. |
| 2 | Simple retry with a fixed delay. Timeout configured. Errors logged but not analyzed. |
| 3 | Documented strategy per error type (4xx vs 5xx). Fallback defined. Retry with exponential backoff. |
| 4 | Circuit breaker + bulkhead patterns. Automatic graceful degradation. Error metrics with alerts. |

---

### PA-02 — Documentation of expected behaviors · Criticality: **SHOULD**

**Analyze:** ADR, runbooks, living documentation (Swagger, AsyncAPI), chaos engineering reports

**Verification commands:**
```bash
find docs/ -name "*runbook*" -o -name "*error*" -o -name "*behavior*" 2>/dev/null
grep -ri "error.handling\|failure.mode\|degraded" . --include="*.md" 2>/dev/null | head -5
```

**Check:** Documentation of failure scenarios, degraded-mode behavior, per-error runbooks

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No documentation. Behaviors discovered in production during incidents. |
| 1 | A few informal notes in the code (comments). No accessible docs. |
| 2 | README or wiki with the main cases. Not always up to date. Missing edge cases. |
| 3 | Structured documentation (ADR, runbooks) covering all error scenarios. Regular review. |
| 4 | Living documentation generated from the code. Tests as documentation. Automated consistency validation. |

---

### PA-03 — Configurable retry policy · Criticality: **MUST**

**Analyze:** Exponential backoff, jitter, retry budget, bulkhead isolation

**Verification commands:**
```bash
grep -ri "exponential\|backoff\|jitter\|retry.budget\|max.retries\|retryPolicy" . --include="*.ts" --include="*.js" --include="*.php" --include="*.yml" 2>/dev/null | head -10
```

**Check:** Exponential backoff with jitter, per-endpoint configuration, non-retriable errors identified (4xx)

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No retry. One error = definitive failure. |
| 1 | Retry with a fixed number of attempts. No backoff. Thundering herd risk. |
| 2 | Retry with linear backoff. Global configuration. No distinction per error type. |
| 3 | Exponential backoff with jitter. Per-endpoint configuration. Non-retriable errors identified (4xx). |
| 4 | Adaptive retry based on the error rate. Circuit breaker integration. Retry metrics exposed. |

---

### PA-04 — Circuit breaker to avoid saturation · Criticality: **MUST**

**Analyze:** Circuit states (closed/open/half-open), thresholds, fallback, metrics

**Verification commands:**
```bash
grep -ri "circuit.breaker\|circuitbreaker\|half.open\|resilience4j\|opossum" . --include="*.ts" --include="*.js" --include="*.php" --include="*.yml" 2>/dev/null | head -10
```

**Check:** Circuit breaker per service, thresholds configured, fallback defined, circuit dashboard

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No circuit breaker. Cascading failures possible. |
| 1 | Global timeout but no circuit breaker. Saturation possible. |
| 2 | Basic circuit breaker with default thresholds. No monitoring. |
| 3 | Circuit breaker configured per service with tuned thresholds. Circuit state dashboard. Alerts. |
| 4 | Smart circuit breaker with automatic half-open testing. Metrics correlated with SLOs. Auto-tuning. |

---

### PA-05 — Centralized processing pause · Criticality: **SHOULD**

**Analyze:** Feature flags for pause, admin API, graceful shutdown hooks, traffic draining

**Verification commands:**
```bash
grep -ri "maintenance.mode\|pause\|drain\|graceful" . --include="*.ts" --include="*.js" --include="*.php" --include="*.yml" 2>/dev/null | head -5
grep -ri "preStop\|terminationGracePeriod" . --include="*.yml" --include="*.yaml" 2>/dev/null | head -5
```

**Check:** Centralized pause mechanism, drain of in-flight processing, audit trail of pauses

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | Impossible to pause without restarting the app. |
| 1 | Pause possible by killing the process. Risk of losing in-flight data. |
| 2 | Feature flag or config to stop new processing. Manual, not centralized. |
| 3 | Centralized pause API/UI. Drain of in-flight processing. Audit trail of pauses. |
| 4 | Automatic orchestration of pauses (maintenance windows). CI/CD integration for safe deploys. |

---

### PA-06 — Safe shutdown mode · Criticality: **MUST**

**Analyze:** Signal handling (SIGTERM), drain period, health check update, checkpoint

**Verification commands:**
```bash
grep -ri "SIGTERM\|graceful.shutdown\|shutdown.hook\|server.shutdown" . --include="*.ts" --include="*.js" --include="*.php" --include="*.yml" 2>/dev/null | head -10
grep -ri "terminationGracePeriodSeconds\|preStop" . --include="*.yml" --include="*.yaml" 2>/dev/null | head -5
```

**Check:** SIGTERM caught, request draining, transaction commit/rollback, orderly connection close

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | Kill -9 only. In-flight transactions lost. |
| 1 | SIGTERM caught but no graceful shutdown. Timeout before forced kill. |
| 2 | Basic graceful shutdown. Waits for in-flight HTTP requests. Workers not handled. |
| 3 | Orchestrated shutdown: stop consumers, drain queues, commit transactions. Configurable timeout. |
| 4 | Coordinated multi-instance shutdown. Health check integrated. Automatic rollback if shutdown fails. |

---

### PA-07 — Controlled recovery after restart · Criticality: **MUST**

**Analyze:** Readiness probes, dependency checks, startup ordering, canary startup

**Verification commands:**
```bash
grep -ri "readinessProbe\|livenessProbe\|startupProbe\|health.check\|depends_on.*healthy" . --include="*.yml" --include="*.yaml" 2>/dev/null | head -10
grep -ri "wait.for.it\|dockerize\|init.container" . --include="*.yml" --include="*.yaml" 2>/dev/null | head -5
```

**Check:** Readiness probes, dependency checks, startup ordering, canary startup

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | All-or-nothing startup. No control over the recovery order. |
| 1 | Manual sequential startup. Manual checks between steps. |
| 2 | Startup script with health checks. Defined order but no auto-rollback. |
| 3 | Orchestrated startup with dependencies. Readiness probes. Rollback if startup fails. |
| 4 | Canary startup. Progressive recovery with metric validation. Self-healing. |

---

### PA-08 — Connector/API isolation mechanism · Criticality: **SHOULD**

**Analyze:** Per-connector feature flags, per-API circuit breaker, tenant isolation, bulkhead

**Verification commands:**
```bash
grep -ri "bulkhead\|isolat\|feature.flag.*api\|circuit.*per.*service" . --include="*.ts" --include="*.js" --include="*.php" 2>/dev/null | head -10
```

**Check:** Per-connector isolation (feature flags, dedicated circuit breaker), tenant isolation, health-based routing

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | Impossible to isolate a connector. All or nothing. |
| 1 | Disabling possible but requires redeployment. |
| 2 | Feature flag per connector. Enable/disable live via config. |
| 3 | Admin UI to isolate/re-enable. Change logs. Per-tenant isolation possible. |
| 4 | Automatic isolation based on health. Self-healing. Proactive notifications. |

---

### PA-09 — Connector notification strategy · Criticality: **SHOULD**

**Analyze:** Multi-channel, smart routing, graded severity, enriched context

**Verification commands:**
```bash
grep -ri "pagerduty\|opsgenie\|alert\|notification\|escalat" . --include="*.yml" --include="*.yaml" --include="*.ts" --include="*.php" 2>/dev/null | head -10
```

**Check:** Multi-channel (Slack/PagerDuty/email), routing to the responsible team, graded severity, enriched context

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No notification. Problems discovered by users. |
| 1 | Basic email notification. No distinction by severity. Alert fatigue. |
| 2 | Slack/Teams + email. Severity defined. No smart routing. |
| 3 | Multi-channel with escalation. Automatic customer notification. Runbook attached. |
| 4 | Contextual notification with preliminary diagnosis. Incident management integration (PagerDuty, OpsGenie). |

---

### PA-12 — Degraded mode (cache, replication, fallback) · Criticality: **MUST**

**Analyze:** Stale cache, static fallback, feature degradation, read replicas

**Verification commands:**
```bash
grep -ri "stale.while.revalidate\|fallback\|degraded\|read.only\|cache.*fallback" . --include="*.ts" --include="*.js" --include="*.php" --include="*.yml" 2>/dev/null | head -10
```

**Check:** Stale cache configured, static fallback, progressive feature degradation, read replica fallback

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No degraded mode. All or nothing. |
| 1 | Manual fallback (human intervention to switch over). |
| 2 | Backup cache for some data. Not automatic. |
| 3 | Automatic degraded mode documented. Stale data acceptable for some use cases. UI indicates the mode. |
| 4 | Progressive graceful degradation. Automatic feature prioritization. Degradation metrics. |

---

### PA-13 — Watch on external API changelog/versioning · Criticality: **SHOULD**

**Analyze:** Dependabot, Renovate, deprecation calendar, contract testing of external APIs

**Verification commands:**
```bash
find . -name "dependabot.yml" -o -name "renovate.json*" -o -name ".renovaterc*" 2>/dev/null
grep -ri "pact\|contract.test\|api.*version.*pin" . --include="*.ts" --include="*.yml" 2>/dev/null | head -5
```

**Check:** Automated changelog monitoring, deprecation calendar, contract testing, version pinning

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No watch. Breaking changes discovered in production. |
| 1 | Occasional manual watch. No defined process. |
| 2 | Subscribed to changelogs. Review before deploying new versions to prod. |
| 3 | Structured watch with a deprecation calendar. Automated compatibility tests. |
| 4 | Contract testing against external APIs. Preventive alert on breaking changes. Planned migration. |

---

### PA-18 — DB migration tests · Criticality: **MUST**

**Analyze:** Expand-contract pattern, shadow writes, data validation, dry-run migrations

**Verification commands:**
```bash
find . -path "*/migrations/*" -o -path "*/database/migrations/*" 2>/dev/null | head -10
grep -ri "flyway\|liquibase\|knex.*migrate\|artisan.*migrate\|alembic" . --include="*.yml" --include="*.yaml" --include="*.json" 2>/dev/null | head -5
grep -ri "expand.contract\|zero.downtime.*migration" . --include="*.md" 2>/dev/null | head -5
```

**Check:** Migrations tested on realistic data, expand-contract, post-migration data validation, dry-run

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | DB migrations tested only in production. Major risk. |
| 1 | Manual test on a dev environment. No realistic data. |
| 2 | Migration on staging with a subset of data. Manual validation. |
| 3 | Migration pipeline with anonymized prod data. Automated tests. Rollback tested. |
| 4 | Blue-green database migrations. Zero-downtime migrations. Backward compatible schemas. |

---

### PA-19 — DB backup plan · Criticality: **MUST**

**Analyze:** 3-2-1 rule, PITR, incremental backups, immutable backups

**Verification commands:**
```bash
grep -ri "backup\|snapshot\|restore\|pgbackrest\|xtrabackup\|pg_dump" . --include="*.yml" --include="*.yaml" --include="*.sh" --include="*.tf" 2>/dev/null | head -10
grep -ri "rpo\|rto\|point.in.time\|pitr" . --include="*.md" --include="*.yml" 2>/dev/null | head -5
```

**Check:** Automatic backup, 3-2-1 rule, PITR, encryption, restore tests, RPO/RTO aligned

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No backup, or backup never tested. |
| 1 | Daily backup. No restore test. Storage in the same zone. |
| 2 | Multi-zone backup. PITR available. Annual test. |
| 3 | Encrypted, multi-region backup. RTO/RPO defined and tested quarterly. Backup monitoring. |
| 4 | Continuous backup with real-time replication. Automated disaster recovery. Compliance audit. |

---

### PA-20 — DB rollback playbook · Criticality: **SHOULD**

**Analyze:** Runbook automation, decision trees, communication templates, post-rollback validation

**Verification commands:**
```bash
find docs/ -name "*rollback*" -o -name "*playbook*" -o -name "*runbook*" 2>/dev/null
grep -ri "rollback.*db\|database.*rollback\|migration.*rollback" . --include="*.md" 2>/dev/null | head -5
```

**Check:** Documented playbook, exact commands, points of no return, post-rollback checklist

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No rollback plan. Improvisation when a problem hits. |
| 1 | Informal procedure known to a few people. |
| 2 | Documented playbook. Not regularly tested. |
| 3 | Playbook with detailed steps, owners, and communication. Tested twice a year. |
| 4 | Automatable rollback. Regular dry-run. Rollback-time metrics. |

---

### PA-21 — DB rollback tests · Criticality: **SHOULD**

**Analyze:** Game days, chaos engineering, RTO measurement, DR drills

**Verification commands:**
```bash
grep -ri "game.day\|chaos.monkey\|chaos.engineering\|dr.drill\|disaster.recovery.*test" . --include="*.md" --include="*.yml" 2>/dev/null | head -5
grep -ri "gremlin\|litmus\|chaos.toolkit\|fault.injection" . 2>/dev/null | head -5
```

**Check:** Planned game days, chaos engineering, measured RTO vs target, regular DR drills

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | Rollback never tested. First test = a real incident. |
| 1 | Tested at setup time. Not tested since. |
| 2 | Annual drill. Non-prod environment. Documented results. |
| 3 | Quarterly drill on a prod-like environment. Metrics collected. Occasional chaos engineering. |
| 4 | Continuous chaos engineering. Regular game days. Validated RTO. Continuous improvement. |

---

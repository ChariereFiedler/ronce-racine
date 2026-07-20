# Section RE — Recovery after a problem (13 questions)

## Questions

- RE-01 — Qualifying idempotent / non-idempotent endpoints (MUST)
- RE-01a — Idempotency key mechanism (MUST)
- RE-01b — Replay tests and validation (SHOULD)
- RE-02 — Data rollback / recovery strategy (MUST)
- RE-02a — Rollback granularity (SHOULD)
- RE-03 — Recovery plan documentation (SHOULD)
- RE-05 — Define RTO (Recovery Time Objective) (MUST)
- RE-05a — Measured RTO vs target RTO (SHOULD)
- RE-05b — RPO (Recovery Point Objective) (MUST)
- RE-06 — Regular controlled restart tests (SHOULD)
- RE-06a — Scope of recovery tests (SHOULD)
- RE-08 — Full recovery validation (MUST)
- RE-08a — Data reconciliation tools (SHOULD)

---

### RE-01 — Qualifying idempotent / non-idempotent endpoints · Criticality: **MUST**

**Analyze:** Idempotency keys, conditional requests (ETags), exactly-once semantics, outbox pattern

**Verification commands:**
```bash
grep -ri "idempoten\|idempotency.key\|if.match\|etag\|exactly.once" . --include="*.ts" --include="*.js" --include="*.php" 2>/dev/null | head -10
grep -ri "outbox\|transactional.outbox" . --include="*.ts" --include="*.php" --include="*.yml" 2>/dev/null | head -5
```

**Check:** List of endpoints with their nature (idempotent/non-idempotent), idempotency key for sensitive operations

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No notion of idempotency. Risk of double-processing not identified. |
| 1 | Aware of the problem but no list. A few endpoints marked "safe to retry". |
| 2 | List of critical endpoints with their nature. Not systematic. |
| 3 | All endpoints documented. Idempotency key pattern implemented for non-idempotent ones. |
| 4 | Idempotency by design. Automated replay tests. Metrics of duplicates detected. |

---

### RE-01a — Idempotency key mechanism · Criticality: **MUST**

**Condition:** Evaluate if RE-01 >= 2

**Analyze:** Key storage (Redis/DB), TTL, handling of in-flight requests

**Verification commands:**
```bash
grep -ri "idempotency.key\|idempotent.*header\|replay.*detect" . --include="*.ts" --include="*.js" --include="*.php" 2>/dev/null | head -5
```

**Check:** Persistent storage, configurable TTL, handling of concurrent requests

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No mechanism. Retry = duplicate risk. |
| 1 | Duplicate detection based on timestamp/hash. Not 100% reliable. |
| 2 | Idempotency key in the header. Configurable TTL. In-memory storage. |
| 3 | Idempotency key with persistent storage (Redis/DB). Cached response returned on replay. |
| 4 | Distributed idempotency with consensus. Exactly-once semantics proven. Chaos tests. |

---

### RE-01b — Replay tests and validation · Criticality: **SHOULD**

**Condition:** Evaluate if RE-01 >= 3

**Analyze:** Automated replay tests, assertions on state, CI/CD integration

**Verification commands:**
```bash
grep -ri "replay.*test\|idempoten.*test\|duplicate.*test" . --include="*.test.*" --include="*.spec.*" 2>/dev/null | head -5
```

**Check:** Automated replay tests, assertions on post-replay state, chaos testing

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No replay tests. |
| 1 | Occasional manual tests. |
| 2 | Automated tests for critical endpoints. |
| 3 | Complete test suite with state assertions. CI/CD integrated. |
| 4 | Chaos testing in production with validation. Reliability metrics. |

---

### RE-02 — Data rollback / recovery strategy · Criticality: **MUST**

**Analyze:** Checkpoints, automatable rollback, transactional outbox, saga pattern

**Verification commands:**
```bash
grep -ri "rollback\|checkpoint\|saga\|compensat\|outbox" . --include="*.ts" --include="*.js" --include="*.php" 2>/dev/null | head -10
```

**Check:** Formalized strategy with checkpoints, automatable rollback, quarterly tests

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No strategy. Data loss accepted or ignored. |
| 1 | Ad-hoc manual rollback. Depends on the experts available. |
| 2 | Documented procedure for common cases. Not tested regularly. |
| 3 | Formalized strategy with checkpoints. Automatable rollback. Quarterly tests. |
| 4 | Transactional outbox pattern. Saga pattern for distributed operations. Automatic recovery. |

---

### RE-02a — Rollback granularity · Criticality: **SHOULD**

**Condition:** Evaluate if RE-02 >= 2

**Analyze:** Granularity (global, batch, transaction, record), point-in-time recovery

**Verification commands:**
```bash
grep -ri "point.in.time\|granular.*rollback\|partial.*rollback" . --include="*.md" --include="*.ts" --include="*.php" 2>/dev/null | head -5
```

**Check:** Rollback per business transaction, per-record compensation, point-in-time recovery

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | Global rollback only (all or nothing). |
| 1 | Rollback per batch/job. |
| 2 | Rollback per business transaction. |
| 3 | Rollback per record with compensation. |
| 4 | Partial rollback with guaranteed consistent state. Point-in-time recovery. |

---

### RE-03 — Recovery plan documentation · Criticality: **SHOULD**

**Analyze:** Runbooks, support escalation, versioned documentation, training

**Verification commands:**
```bash
find docs/ -name "*recovery*" -o -name "*reprise*" -o -name "*disaster*" -o -name "*dr-*" 2>/dev/null
grep -ri "disaster.recovery\|plan.de.reprise\|DRP\|BCP" . --include="*.md" 2>/dev/null | head -5
```

**Check:** Detailed runbooks, documented escalation, versioned documentation, regular training

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No documentation. Tribal knowledge. |
| 1 | Informal notes. Known to a few experts. |
| 2 | Basic documentation in a wiki. Not always up to date. |
| 3 | Detailed runbooks with escalation. Reviewed twice a year. Accessible 24/7. |
| 4 | Documentation as code. Versioned. Tested automatically. Regular training. |

---

### RE-05 — Define RTO (Recovery Time Objective) · Criticality: **MUST**

**Analyze:** RTO by service criticality, contractual SLA, regular measurement

**Verification commands:**
```bash
grep -ri "rto\|recovery.time\|time.to.recover" . --include="*.md" --include="*.yml" 2>/dev/null | head -5
```

**Check:** RTO defined by criticality, contractual SLA, measured and reported

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No RTO defined. "We come back up when it's ready." |
| 1 | Implicit RTO based on experience. Not contracted. |
| 2 | RTO defined globally (e.g. 4h). Not by service criticality. |
| 3 | RTO per criticality level. Contractual SLA. Measured and reported. |
| 4 | Aggressive RTO (<15min) with auto-recovery. Objective tested monthly. |

---

### RE-05a — Measured RTO vs target RTO · Criticality: **SHOULD**

**Condition:** Evaluate if RE-05 >= 2

**Analyze:** Measurement during drills, documented gap, corrective actions

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | RTO never measured. |
| 1 | Measured during real incidents. Often exceeded. |
| 2 | Measured in an annual drill. Gap documented. |
| 3 | Measured quarterly. Actions if the gap is >20%. |
| 4 | Measured continuously. Auto-recovery validated. 99%+ compliance. |

---

### RE-05b — RPO (Recovery Point Objective) · Criticality: **MUST**

**Condition:** Evaluate if RE-05 >= 3

**Analyze:** RPO by data criticality, synchronous replication, tailored backup

**Verification commands:**
```bash
grep -ri "rpo\|recovery.point\|data.loss\|replication.*synchron" . --include="*.md" --include="*.yml" 2>/dev/null | head -5
```

**Check:** RPO defined by criticality, tailored replication, aligned backup

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | RPO not defined. |
| 1 | RPO = last backup (potentially 24h of loss). |
| 2 | RPO defined by criticality. Tailored backup. |
| 3 | RPO <1h for critical data. Synchronous replication. |
| 4 | RPO = 0 for critical data. Multi-site active-active. |

---

### RE-06 — Regular controlled restart tests · Criticality: **SHOULD**

**Analyze:** DR drills, game days, chaos engineering, measured RTO

**Verification commands:**
```bash
grep -ri "dr.drill\|game.day\|restart.test\|recovery.test" . --include="*.md" --include="*.yml" 2>/dev/null | head -5
```

**Check:** Regular drills, prod-like environment, metrics collected

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | Never tested. First test = a real incident. |
| 1 | Tested at initial go-live. Not since. |
| 2 | Annual drill. Non-prod environment. |
| 3 | Quarterly drill on a prod-like environment. Metrics collected. |
| 4 | Continuous chaos engineering. Regular game days. Continuous improvement. |

---

### RE-06a — Scope of recovery tests · Criticality: **SHOULD**

**Condition:** Evaluate if RE-06 >= 2

**Analyze:** Scenarios tested (DB crash, network), business validation, multi-region DR

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | Simple restart test. |
| 1 | Test with baseline data. No business validation. |
| 2 | Test with incident scenarios (DB crash, network). Partial validation. |
| 3 | Full tests including failover, rollback, data integrity. Validation checklist. |
| 4 | End-to-end tests with clients. Multi-region DR. Automatic validation. |

---

### RE-08 — Full recovery validation · Criticality: **MUST**

**Analyze:** Validation scripts, before/after comparison, audit trail, reconciliation

**Verification commands:**
```bash
grep -ri "reconcili\|validation.*recovery\|data.integrity\|checksum" . --include="*.ts" --include="*.php" --include="*.sh" 2>/dev/null | head -5
```

**Check:** Post-recovery validation scripts, before/after comparison, alerts on discrepancy

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No validation. Hoping everything is OK. |
| 1 | Manual spot-check validation. Not systematic. |
| 2 | Post-recovery validation checklist. Manual controls. |
| 3 | Automatic validation scripts. Before/after comparison. Alerts on discrepancy. |
| 4 | Continuous validation with reconciliation. Full audit trail. Recovery certification. |

---

### RE-08a — Data reconciliation tools · Criticality: **SHOULD**

**Condition:** Evaluate if RE-08 >= 2

**Analyze:** Comparison scripts, checksums, data quality tools

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No tool. Visual check. |
| 1 | Manual SQL queries. Count comparison. |
| 2 | Comparison scripts. Checksums on critical tables. |
| 3 | Reconciliation tool with a detailed report. Automatic diff. |
| 4 | Data quality platform. Continuous validation. Automatic correction where possible. |

---

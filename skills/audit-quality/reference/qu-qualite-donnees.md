# Audit grid — QU Data Quality section

12 questions. Schema validation, null handling, business consistency, anomaly correction, traceability, data lifetime.

## Table of contents

- [QU-01 — Input schema validation (JSON Schema, OpenAPI)](#qu-01--input-schema-validation-json-schema-openapi--criticality-must)
- [QU-01a — Validation error handling](#qu-01a--validation-error-handling--criticality-should)
- [QU-02 — Null/incomplete value handling](#qu-02--nullincomplete-value-handling--criticality-should)
- [QU-03 — Business consistency verification](#qu-03--business-consistency-verification--criticality-must)
- [QU-03a — Data anomaly detection](#qu-03a--data-anomaly-detection--criticality-could)
- [QU-04 — Manual anomaly correction possible](#qu-04--manual-anomaly-correction-possible--criticality-should)
- [QU-05 — Automatic anomaly correction suggestions](#qu-05--automatic-anomaly-correction-suggestions--criticality-could)
- [QU-06 — Unique correlation ID (traceId)](#qu-06--unique-correlation-id-traceid--criticality-should)
- [QU-07 — Technical logs / business events separation](#qu-07--technical-logs--business-events-separation--criticality-should)
- [QU-08 — Data lifetime policy](#qu-08--data-lifetime-policy--criticality-must)
- [QU-09 — Automatic purges of end-of-life data](#qu-09--automatic-purges-of-end-of-life-data--criticality-should)
- [QU-09a — Purge verification](#qu-09a--purge-verification--criticality-could)

---

### QU-01 — Input schema validation (JSON Schema, OpenAPI) — Criticality: **must**

**Analyze:** Validation schemas (Zod, Joi, JSON Schema, class-validator, OpenAPI), validation middleware

**Check:**
- Systematic input validation (API, forms)
- Formal schema defined (JSON Schema, OpenAPI, Zod)
- Server-side validation (not only client-side)
- Contract-first design (API-first)
- Schema registry for versioning

**Commands:**
```bash
# Validation schemas
grep -ri "zod\|joi\|class-validator\|yup\|json.schema\|openapi" package.json composer.json 2>/dev/null
grep -r "\.parse\|\.safeParse\|\.validate" --include="*.ts" --include="*.php" | grep -v node_modules | wc -l
# OpenAPI
ls openapi.yaml openapi.json swagger.json api-docs/ 2>/dev/null
# Form Request (Laravel)
find . -name "*Request.php" -path "*/Http/Requests/*" 2>/dev/null | head -10
```

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No validation. Data accepted as-is. |
| 1 | Basic validation (primitive types). Silent errors. |
| 2 | JSON Schema/OpenAPI for the main APIs. Server-side validation. |
| 3 | Complete validation with clear error messages. Contract-first design. |
| 4 | Schema registry. Schema versioning. Backward compatibility checks. Client SDK generation. |

---

### QU-01a — Validation error handling — Criticality: **should**

**Analyze:** Validation-error format, RFC 7807/9457, error messages, i18n

**Check:**
- Structured errors with a path to the invalid field
- Consistent format (RFC 7807 Problem Details or equivalent)
- Clear, actionable error messages
- No sensitive information leaked in the errors
- Dry-run mode for validation preview

**Commands:**
```bash
# Error format
grep -ri "problem.details\|rfc.7807\|rfc.9457\|validation.error" --include="*.ts" --include="*.php" 2>/dev/null | head -10
# Structured error messages
grep -ri "error.*message\|error.*field\|error.*path" --include="*.ts" --include="*.php" 2>/dev/null | head -10
# Error i18n
grep -ri "validation\.\|trans(" --include="*.php" 2>/dev/null | head -5
```

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | Generic 500 error. No detail. |
| 1 | Basic error message. No localization of the error. |
| 2 | Structured errors with a path to the invalid field. |
| 3 | i18n errors. Correction suggestions. Constraint documentation. |
| 4 | Validation preview. Dry-run mode. Generated client-side validation. |

---

### QU-02 — Null/incomplete value handling — Criticality: **should**

**Analyze:** Null/undefined strategy, strictNullChecks, Optional types, fail-fast

**Check:**
- `strictNullChecks` enabled (TypeScript) or `strict_types` (PHP)
- Explicit null/undefined handling (no `!` non-null assertion)
- Documented default values
- Fail-fast strategy for critical data
- Nullable annotations / static analysis

**Commands:**
```bash
# TypeScript strict
grep "strictNullChecks\|\"strict\"" tsconfig.json 2>/dev/null
# Non-null assertions
grep -r "!\." --include="*.ts" | grep -v node_modules | grep -v ".test." | wc -l
# PHP strict types
grep -r "declare(strict_types" --include="*.php" | grep -v vendor | wc -l
# Nullable fields
grep -r "nullable\|Optional\|Maybe" --include="*.ts" --include="*.php" | grep -v node_modules | grep -v vendor | wc -l
```

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No handling. NullPointerException in prod. |
| 1 | Generic try/catch. Error logs without context. |
| 2 | Default values defined. Optional/Maybe patterns used. |
| 3 | Explicit strategy (fail-fast vs default). Nullable annotations. Static analysis. |
| 4 | Non-nullable types by default. Exhaustive null checks. Property-based testing. |

---

### QU-03 — Business consistency verification — Criticality: **must**

**Analyze:** Business rules (DDD invariants, business rules), semantic validation, cross-field validation

**Check:**
- Business rules documented and centralized
- Validation beyond format (semantics, consistency)
- Cross-field validation (end date > start date, consistent totals)
- Domain-Driven Design (invariants in the aggregates)
- Business rules engine if complexity is significant

**Commands:**
```bash
# Business rules
find . -name "*Rule*" -o -name "*Validator*" -o -name "*Specification*" 2>/dev/null | grep -v node_modules | grep -v vendor | head -10
# DDD patterns
find . -name "*Aggregate*" -o -name "*ValueObject*" -o -name "*DomainEvent*" 2>/dev/null | grep -v vendor | head -10
# Cross-field validation
grep -ri "refine\|superRefine\|after\|before\|cross.valid" --include="*.ts" --include="*.php" 2>/dev/null | head -10
```

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No business verification. Inconsistent data accepted. |
| 1 | Ad-hoc checks in the code. No centralized rules. |
| 2 | Documented business rules. Validation implemented for critical cases. |
| 3 | Business rules engine. Validation on input and in batch. Alerts on anomalies. |
| 4 | Domain-Driven Design. Invariants enforced. Event sourcing with validation. ML for anomaly detection. |

---

### QU-03a — Data anomaly detection — Criticality: **could**

**Analyze:** Outlier detection, data-quality monitoring, data observability

**Check:**
- Periodic verification jobs
- Alerts on statistical deviations
- Data observability (Great Expectations, dbt tests)
- ML anomaly detection (Isolation Forest, etc.)
- Auto-remediation for simple cases

**Commands:**
```bash
# Data quality jobs
find . -name "*anomal*" -o -name "*outlier*" -o -name "*data.quality*" 2>/dev/null | head -10
grep -ri "great.expectations\|dbt.test\|monte.carlo" package.json 2>/dev/null
# Scheduled data checks
grep -ri "schedule\|cron\|data.check" .github/ app/Console/Kernel.php 2>/dev/null | head -10
```

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No detection. Discovered by users. |
| 1 | Occasional manual SQL queries. |
| 2 | Periodic verification jobs. Anomaly reports. |
| 3 | Real-time monitoring. Alerts on statistical deviation. |
| 4 | ML anomaly detection. Auto-remediation for simple cases. Data observability platform. |

---

### QU-04 — Manual anomaly correction possible — Criticality: **should**

**Analyze:** Admin interface, audit trail, approval workflow

**Check:**
- Correction interface for authorized users
- Complete audit trail (who, when, what, why)
- Business validation on corrections
- Preview before saving
- Approval workflow for sensitive data

**Commands:**
```bash
# Admin panel
find . -name "*admin*" -o -name "*backoffice*" 2>/dev/null | grep -v node_modules | grep -v vendor | head -10
# Audit trail
grep -ri "auditable\|audit.log\|activity.log\|paper.trail" --include="*.php" --include="*.ts" 2>/dev/null | head -10
find . -name "*Audit*" -o -name "*Activity*" 2>/dev/null | grep -v vendor | head -10
```

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No correction UI. Direct SQL queries. |
| 1 | Basic admin panel. No audit of the modifications. |
| 2 | Correction interface with history. Basic validation. |
| 3 | Correction workflow with approval. Complete audit trail. Preview before saving. |
| 4 | Self-service data correction. Undo/redo. Batch corrections. Data lineage visible. |

---

### QU-05 — Automatic anomaly correction suggestions — Criticality: **could**

**Analyze:** Correction suggestions, fuzzy matching, ML suggestions, bulk operations

**Check:**
- Automatic correction suggestions
- Fuzzy matching for typo correction
- Confidence score on the suggestions
- Bulk apply with human validation
- Learning from past corrections

**Commands:**
```bash
# Auto-correction / suggestions
grep -ri "suggest\|fuzzy\|autocorrect\|levenshtein" --include="*.ts" --include="*.php" 2>/dev/null | head -10
grep -ri "fuzzywuzzy\|string.similarity" package.json 2>/dev/null
```

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No automatic suggestion. |
| 1 | Basic suggestions (e.g. trim whitespace). |
| 2 | Defined correction rules. Contextual suggestions. |
| 3 | ML for suggestions. Confidence score. Bulk apply with validation. |
| 4 | Auto-correction for certain rules. Human-in-the-loop for uncertain ones. Learning from corrections. |

---

### QU-06 — Unique correlation ID (traceId) — Criticality: **should**

**Analyze:** traceId/correlationId, OpenTelemetry, W3C Trace Context, distributed tracing

**Check:**
- Unique identifier per request (traceId, correlationId)
- Propagation of the traceId across services/layers
- traceId included in logs and error responses
- OpenTelemetry integrated
- Log/metric/trace correlation

**Commands:**
```bash
# TraceId / correlation
grep -ri "traceId\|correlationId\|requestId\|trace.context\|traceparent" . --include="*.ts" --include="*.php" 2>/dev/null | head -10
# OpenTelemetry
grep -ri "opentelemetry\|otel\|jaeger\|zipkin" package.json composer.json .env* 2>/dev/null
# Tracing middleware
grep -ri "middleware.*trace\|trace.*middleware" --include="*.ts" --include="*.php" 2>/dev/null | head -5
```

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No traceId. Impossible to correlate logs. |
| 1 | TraceId generated but not propagated across services. |
| 2 | TraceId propagated via headers. Visible in all logs of a request. |
| 3 | OpenTelemetry integrated. Spans and traces. Correlation with metrics and logs. |
| 4 | Complete distributed tracing. Intelligent trace sampling. Business transaction correlation. |

---

### QU-07 — Technical logs / business events separation — Criticality: **should**

**Analyze:** Event sourcing, event bus, store separation, event schema

**Check:**
- Technical logs and business events separated
- Structured business events (documented schema)
- Event bus for business events (Kafka, RabbitMQ, EventBridge)
- Differentiated retention (7d technical logs, 10 years accounting events)
- Business audit trail usable by non-technical people

**Commands:**
```bash
# Event sourcing / events
find . -name "*Event*" -o -name "*event*" 2>/dev/null | grep -v node_modules | grep -v vendor | head -10
grep -ri "event.sourcing\|event.store\|domain.event" --include="*.ts" --include="*.php" 2>/dev/null | head -10
# Message broker
grep -ri "kafka\|rabbitmq\|eventbridge\|pub.sub" package.json composer.json .env* docker-compose*.yml 2>/dev/null
# Log separation
grep -ri "business.log\|audit.log\|activity.log" --include="*.ts" --include="*.php" 2>/dev/null | head -10
```

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | Everything mixed in the same logs. |
| 1 | Technical and business logs in separate files. |
| 2 | Event bus for business events. Technical logs in ELK. |
| 3 | Event sourcing for the business audit. Documented event schema. |
| 4 | CQRS with an event store. Business analytics on events. Automated compliance reporting. |

---

### QU-08 — Data lifetime policy — Criticality: **must**

**Analyze:** Retention policy, data classification, TTL, tiered storage

**Check:**
- Retention policy documented per data type
- Data classification (public, internal, confidential, restricted)
- Retention periods aligned with legal obligations (GDPR, accounting)
- Automatic TTL in the databases
- Data lifecycle management

**Commands:**
```bash
# Retention policy
find . -name "*retention*" -o -name "*lifecycle*" -o -name "*data.policy*" 2>/dev/null | head -5
# TTL in the configs
grep -ri "ttl\|expire\|retention" --include="*.yml" --include="*.yaml" --include="*.php" 2>/dev/null | head -10
# Time-based partitioning
grep -ri "partition\|archiv" --include="*.sql" --include="*.php" 2>/dev/null | head -10
```

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No policy. Data kept indefinitely. |
| 1 | Informal policy. Occasional manual purges. |
| 2 | Policy documented per data type. Retention defined. |
| 3 | Data classification. Automatic TTL. Verifiable GDPR compliance. |
| 4 | Automated data lifecycle management. Right to be forgotten integrated. Deletion audit trail. |

---

### QU-09 — Automatic purges of end-of-life data — Criticality: **should**

**Analyze:** Purge jobs, soft delete, cascading delete, dry-run

**Check:**
- Automatic purge jobs (cron, scheduled jobs)
- Prior dry-run before deletion
- Soft delete with a grace period
- Deletion cascade (dependent data)
- Notification before deletion
- Deletion logs

**Commands:**
```bash
# Purge jobs
grep -ri "purge\|prune\|cleanup\|delete.old\|model:prune" app/Console/ .github/ 2>/dev/null | head -10
# Soft delete
grep -ri "SoftDelete\|soft.delete\|deleted_at" --include="*.php" --include="*.ts" 2>/dev/null | head -10
# Scheduled tasks
cat app/Console/Kernel.php 2>/dev/null | head -30
```

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No automatic purge. Storage grows indefinitely. |
| 1 | Manual purge scripts. Occasional execution. |
| 2 | Scheduled purge jobs. Deletion logs. |
| 3 | Automatic purge with prior dry-run. Notification before deletion. Soft delete. |
| 4 | Tiered storage with archiving. Purge propagated to third-party systems. Compliance proof. |

---

### QU-09a — Purge verification — Criticality: **could**

**Analyze:** Post-purge audit, volume monitoring, deletion certificates, verification across all systems

**Check:**
- Automated post-purge verification
- Volume metrics before/after purge
- Alerts on anomalies (abnormal purge volume)
- Deletion certification for compliance
- Verification in secondary systems (caches, replicas, backups)

**Commands:**
```bash
# Post-purge verification
grep -ri "verify.*purge\|audit.*delete\|post.purge" --include="*.php" --include="*.ts" 2>/dev/null | head -10
# Volume monitoring
grep -ri "count.*before\|count.*after\|volume.*check" --include="*.php" --include="*.ts" 2>/dev/null | head -10
```

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No verification. Blind trust. |
| 1 | Manual verification on a sample. |
| 2 | Volume metrics before/after. Alerts on anomalies. |
| 3 | Automated post-purge audit. Verification across all systems. |
| 4 | Deletion certification. Third-party audit. Cryptographic proof. |

---

# Logging section - Logs, guidelines, baggage

3 questions. Correlated structured logs, logging guideline, contextual baggage.

## Table of contents

- [ob-01 - Correlated structured logs](#ob-01--correlated-structured-logs--criticality-must)
- [ob-02 - Logging guideline and message structure](#ob-02--logging-guideline-and-message-structure--criticality-should)
- [ob-03 - Analysis and implementation of useful baggage](#ob-03--analysis-and-implementation-of-useful-baggage--criticality-should)

---

### ob-01 - Correlated structured logs · Criticality: **MUST**

**Analyze:** Logging config (Winston, Pino, Bunyan, structlog, slog), log format, traceId/spanId correlation, centralized aggregator

**Verification commands:**
```bash
# Count console.log/error/warn in the code
grep -r "console.log\|console.error\|console.warn" --include="*.ts" --include="*.vue" | grep -v node_modules | wc -l
# Check for the presence of logging frameworks
grep -ri "winston\|pino\|loglevel\|sentry\|structlog\|slog\|bunyan" package.json composer.json requirements.txt go.mod 2>/dev/null
# Look for traceId propagation
grep -ri "traceId\|trace_id\|traceparent\|correlationId\|x-request-id" --include="*.ts" --include="*.py" --include="*.go" --include="*.java" --include="*.php" 2>/dev/null | head -10
```

**Check:**
- Structured logs (JSON, no `console.log` in prod)
- Standard fields: timestamp, level, service, traceId, spanId, message
- Correlation via traceId/correlationId across services
- Indexing in a centralized aggregator (ELK, Loki, Datadog)
- Automatic PII masking, documented retention policy

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | No logs or unstructured logs (free text). Impossible to parse or search automatically. |
| 1 | Partially structured logs. Format varies per service. No common standard and no traceId. |
| 2 | JSON logs with basic fields (timestamp, level, message). Missing traceId/spanId for cross-service correlation. |
| 3 | Structured logs with traceId/spanId (OpenTelemetry). Correlation possible across services. Indexing in an aggregator (ELK, Loki). |
| 4 | Logs enriched with business context, automatic alerting on error patterns, documented retention policy, automatic PII masking. |

**Client-side variant (SPA/PWA):**
| Level | Criteria |
|--------|----------|
| 0 | Raw `console.log` in production. No control. |
| 1 | Conditional logger (loglevel, disabled in prod). |
| 2 | Integrated error tracking (Sentry, Bugsnag). Automatic error capture. |
| 3 | Structured client logs. User/session context attached to errors. |
| 4 | Session replay (LogRocket, Sentry Replay). Correlation of errors/user actions. |

---

### ob-02 - Logging guideline and message structure · Criticality: **SHOULD**

**Analyze:** Documentation of logging conventions, message templates, automatic validation, severity levels

**Verification commands:**
```bash
# Look for a documented logging guideline
find . -name "*.md" -o -name "*.adoc" | xargs grep -li "log\|logging\|guideline" 2>/dev/null | head -5
# Check consistent use of log levels
grep -rn "\.error\|\.warn\|\.info\|\.debug\|Log::error\|Log::warning\|Log::info\|Log::debug" --include="*.ts" --include="*.php" --include="*.py" 2>/dev/null | head -10
# Look for ESLint/linter rules for logs
grep -ri "no-console\|log\|logging" .eslintrc* eslint.config* 2>/dev/null
```

**Check:**
- Documented guideline: when to log, at which level, which fields to include
- Standardized levels: ERROR (action required), WARN (attention), INFO (business events), DEBUG (development)
- Mandatory fields defined (ISO8601 timestamp, severity, service, action, traceId)
- Automatic validation in CI (log linting)
- Templates per use case (audit trail, technical debug, business events)
- Documented anti-patterns (no PII, no secrets, no logs inside loops)

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | No guideline. Each developer logs however they want. Inconsistent messages like "error occurred". |
| 1 | A few undocumented verbal conventions. Variable adoption across teams. |
| 2 | Guideline document exists but not always followed. No automatic validation. |
| 3 | Guidelines documented and reviewed in code review. Mandatory fields defined (severity, service, action). |
| 4 | Automatic log linting in CI. Standardized message templates. Examples per use case (audit, debug, business). |

---

### ob-03 - Analysis and implementation of useful baggage · Criticality: **SHOULD**

**Analyze:** Context propagation (MDC, AsyncLocalStorage, context.Context), OpenTelemetry baggage, automatic log/trace enrichment

**Verification commands:**
```bash
# Look for context propagation (MDC, AsyncLocalStorage, OTel Baggage)
grep -ri "AsyncLocalStorage\|MDC\|context\.Context\|opentelemetry.*baggage\|W3C.*Baggage\|traceparent" --include="*.ts" --include="*.java" --include="*.go" --include="*.py" --include="*.php" 2>/dev/null | head -10
# Look for propagated business baggage
grep -ri "tenantId\|userId\|orderId\|batchId\|requestId" --include="*.ts" --include="*.java" --include="*.go" --include="*.py" --include="*.php" 2>/dev/null | head -10
```

**Check:**
- Essential baggage propagated: tenantId, userId, requestId, environment
- Business baggage defined per domain (orderId, batchId, connectorName, etc.)
- Automatic propagation via MDC/AsyncLocalStorage/context.Context
- W3C Baggage / OpenTelemetry Baggage standard used
- Dashboards segmented by baggage (per tenant, per connector)
- No sensitive data in the baggage (transmitted in clear text in headers)

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | No contextual baggage. Impossible to know which customer/connector is impacted without manual analysis. |
| 1 | Some business information logged manually, not systematic. Context lost between calls. |
| 2 | Basic baggage (userId, tenantId) propagated. No advanced business context (orderId, batchId). |
| 3 | Business baggage defined per domain and propagated automatically via context/MDC. Documentation of critical baggage. |
| 4 | Baggage enriched dynamically (feature flags, A/B test groups). Dashboards per baggage. Alerts segmented per customer. |

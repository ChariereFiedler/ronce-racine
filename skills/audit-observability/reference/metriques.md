# Metrics section — RED/USE, latency, saturation, transient errors

4 questions. RED/USE metrics, latency drift tracking, pool saturation, abnormal transient-error detection.

## Table of contents

- [ob-04 — RED/USE metrics](#ob-04--reduse-metrics--criticality-should)
- [ob-07 — Latency drift tracking](#ob-07--latency-drift-tracking--criticality-should)
- [ob-08 — Pool saturation (thread, DB, API)](#ob-08--pool-saturation-thread-db-api--criticality-could)
- [ob-09 — Abnormal transient-error detection](#ob-09--abnormal-transient-error-detection--criticality-should)

---

### ob-04 — RED/USE metrics · Criticality: **SHOULD**

**Analyze:** Prometheus instrumentation, OpenTelemetry metrics, StatsD, custom metrics, SLIs/SLOs

**Verification commands:**
```bash
# Check for the presence of metrics libraries
grep -ri "prometheus\|micrometer\|opentelemetry.*metrics\|statsd\|web-vitals\|@sentry/tracing" package.json composer.json requirements.txt go.mod 2>/dev/null
# Look for a /metrics endpoint
grep -ri "/metrics\|metrics_path\|PrometheusController" --include="*.ts" --include="*.yaml" --include="*.yml" --include="*.php" --include="*.go" 2>/dev/null | head -5
# Look for custom histograms or counters
grep -ri "histogram\|counter\|gauge\|summary\|observe\|increment" --include="*.ts" --include="*.go" --include="*.java" --include="*.py" --include="*.php" 2>/dev/null | head -10
```

**Check:**
- RED metrics (Rate, Errors, Duration) for services
- USE metrics (Utilization, Saturation, Errors) for resources
- Percentiles measured (p50, p95, p99), not just the average
- Custom business metrics
- Metrics exposure (/metrics endpoint, OTLP)
- SLIs derived from RED/USE metrics

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | No application metrics. Only basic infra metrics (CPU, RAM) if available. |
| 1 | A few ad-hoc metrics (homemade counters). No RED/USE standard. Manual collection. |
| 2 | RED metrics (Rate, Errors, Duration) on main endpoints. No USE metrics on resources. |
| 3 | Complete RED metrics + USE on critical resources (DB pools, queues). Standard dashboards. Percentiles (p50, p95, p99). |
| 4 | SLIs derived from RED/USE metrics. Error budgets computed automatically. Business metrics (conversion, business throughput). |

**Client-side variant (SPA/PWA):**
| Level | Criteria |
|--------|----------|
| 0 | No performance metrics collected. |
| 1 | Basic Web Vitals (LCP, FID, CLS) measured manually. |
| 2 | Web Vitals + custom metrics collected (e.g. `web-vitals` lib). |
| 3 | Real User Monitoring (RUM) integrated. Metrics per page/component. |
| 4 | Performance budgets enforced in CI. Blocking regression if budget exceeded. |

---

### ob-07 — Latency drift tracking · Criticality: **SHOULD**

**Analyze:** Latency alerts, latency SLO, dynamic baseline, anomaly detection, deployment correlation

**Verification commands:**
```bash
# Look for references to performance and latency metrics
grep -ri "web-vitals\|lcp\|fid\|inp\|cls\|lighthouse\|latency\|p95\|p99\|percentile\|apdex" . --include="*.ts" --include="*.json" --include="*.yaml" --include="*.yml" 2>/dev/null | head -10
# Look for latency alerts
grep -ri "predict_linear\|latency.*alert\|duration.*threshold\|slo.*latency" --include="*.yaml" --include="*.yml" --include="*.rules" 2>/dev/null | head -5
```

**Check:**
- Latency measured in percentiles (p50, p95, p99)
- Dynamic baseline per endpoint
- Drift detection (baseline vs current, ±2 sigma)
- Predictive alerts (trend, not just threshold)
- Correlation latency ↔ deployments ↔ load
- Latency budget per feature/SLO

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | No latency tracking. Degradation detected only on user complaint. |
| 1 | Average latency monitored. No history or comparison. Poorly calibrated fixed thresholds. |
| 2 | Percentiles tracked (p95, p99). Alerts on fixed-threshold breach. No trend analysis. |
| 3 | Latency baseline per endpoint. Anomaly detection against history (±2 sigma). Predictive alerts. |
| 4 | ML for subtle drift detection. Automatic correlation latency↔deployments. Latency budget per feature. |

**Client-side variant (SPA/PWA):**
| Level | Criteria |
|--------|----------|
| 0 | No frontend performance measurement. |
| 1 | LCP/FID measured basically (in dev only). |
| 2 | LCP/INP/CLS measured in production via `web-vitals` or Sentry. |
| 3 | Performance budgets defined per page/route. CI checks the budgets. |
| 4 | Alerts on performance regression. Correlation with deployments. |

---

### ob-08 — Pool saturation (thread, DB, API) · Criticality: **COULD**

**Analyze:** Connection pool config (DB, Redis, HTTP), pool monitoring, thread pools, circuit breakers, PgBouncer

**Verification commands:**
```bash
# Look for pool configurations
grep -ri "pool_size\|max_connections\|maxPoolSize\|connectionLimit\|hikari\|pgbouncer\|connection.*pool" --include="*.ts" --include="*.yaml" --include="*.yml" --include="*.env*" --include="*.php" --include="*.java" --include="*.go" 2>/dev/null | head -10
# Look for exposed pool metrics
grep -ri "pool.*active\|pool.*idle\|pool.*wait\|pool.*size\|pool.*metric" --include="*.ts" --include="*.java" --include="*.go" --include="*.py" 2>/dev/null | head -5
# Look for circuit breakers
grep -ri "circuit.*breaker\|resilience4j\|bulkhead\|rate.*limit" --include="*.ts" --include="*.java" --include="*.go" --include="*.yaml" 2>/dev/null | head -5
```

**Check:**
- Pool saturation metrics exposed (active, idle, max, queue depth, wait time)
- Graduated alerts before saturation (warning 70%, critical 90%)
- Sizing documented and justified
- Circuit breakers tied to saturation (fail fast vs timeout)
- Auto-scaling if applicable (PgBouncer, ThreadPoolExecutor)

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | No visibility into pools. Saturation discovered only at crash time (connection refused). |
| 1 | Pool metrics exposed but not monitored. No saturation alert. |
| 2 | Alerts on >80% saturation of critical pools (DB connections, thread pools). No prediction. |
| 3 | Dedicated pool dashboards with history. Graduated alerts (warning 70%, critical 90%). Capacity planning. |
| 4 | Auto-scaling of pools based on prediction. Alerts before saturation (trend). Circuit breakers tied to saturation. |

**Client-side variant (SPA/PWA):**
| Level | Criteria |
|--------|----------|
| 0 | No client resource monitoring. |
| 1 | IndexedDB/localStorage quota monitoring (alert when space is low). |
| 2 | Bundle size tracking (bundle size tracked in CI). |
| 3 | Memory leak detection (heap monitoring in dev/staging). |
| 4 | Automated Lighthouse CI. Performance budgets on bundle/memory/assets. |

---

### ob-09 — Abnormal transient-error detection · Criticality: **SHOULD**

**Analyze:** Error classification (transient vs permanent), error-rate baseline, anomaly detection, retry policies

**Verification commands:**
```bash
# Look for transient-error handling and retries
grep -ri "retry\|transient\|circuit.*breaker\|backoff\|exponential" --include="*.ts" --include="*.java" --include="*.go" --include="*.py" --include="*.php" 2>/dev/null | head -10
# Look for error categorization
grep -ri "isRetryable\|isTransient\|error.*class\|error.*type\|HttpStatus\.\(5\|SERVICE_UNAVAILABLE\|GATEWAY_TIMEOUT\)" --include="*.ts" --include="*.java" --include="*.go" --include="*.py" --include="*.php" 2>/dev/null | head -10
# Look for error-rate alerts
grep -ri "error_rate\|error.*ratio\|5xx.*rate\|error.*budget" --include="*.yaml" --include="*.yml" --include="*.rules" 2>/dev/null | head -5
```

**Check:**
- Error classification: transient (retry OK) vs permanent (action required)
- Error-rate baseline per endpoint
- Statistical analysis (z-score, standard deviation) vs static thresholds
- Correlation with deployments and infra changes
- ML anomaly detection (Isolation Forest, Prophet) if applicable
- Signal vs noise distinction to avoid alert fatigue

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | Transient errors ignored or drowned in the noise. No permanent/transient distinction. |
| 1 | Basic error counting. Fixed thresholds triggering too many false positives or missing real issues. |
| 2 | Error categorization (transient, permanent). Distinct alerts but manual thresholds. |
| 3 | Statistical analysis of error rates (standard deviation). Baseline per endpoint. Correlation with deployments. |
| 4 | ML anomaly detection on error patterns. Automatic root-cause classification. Auto-attached runbooks. |

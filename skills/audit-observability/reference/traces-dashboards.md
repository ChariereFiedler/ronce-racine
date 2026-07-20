# Traces & Dashboards section — Visualization and distributed tracing

2 questions. Real-time dashboards, distributed traces.

## Table of contents

- [ob-05 — Real-time dashboards](#ob-05--real-time-dashboards--criticality-should)
- [ob-06 — Distributed traces (OTel, Elastic APM)](#ob-06--distributed-traces-otel-elastic-apm--criticality-could)

---

### ob-05 — Real-time dashboards · Criticality: **SHOULD**

**Analyze:** Grafana files (JSON), dashboard configs, links to dashboards in the docs, hierarchical structure

**Verification commands:**
```bash
# Look for dashboard configuration files
find . -name "*.grafana.*" -o -name "*dashboard*" -o -name "*.json" -path "*/grafana/*" 2>/dev/null | head -5
# Look for references to dashboards in the documentation
grep -ri "grafana\|dashboard\|datadog\|kibana" --include="*.md" --include="*.yaml" --include="*.yml" 2>/dev/null | head -5
```

**Check:**
- Existing dashboards accessible to the team
- Hierarchical structure: overview → service → endpoint → instance
- Deployment and incident annotations
- Time comparisons (week-over-week)
- Real-time refresh (auto-refresh < 1min)
- Dashboards as code (versioned JSON/Terraform)

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | No dashboard or obsolete/unmaintained dashboard. Visibility only via manual logs. |
| 1 | Basic infra dashboard (default Grafana/CloudWatch). No application view. |
| 2 | Per-service dashboards with main metrics. No cross-cutting view or drill-down. |
| 3 | Hierarchical dashboards (overview → service → endpoint). Filters per environment/tenant. Incident annotations. |
| 4 | Real-time dashboards with auto-refresh <1min. Period comparison (week-over-week). Business dashboards integrated. TV screens. |

**Client-side variant (SPA/PWA):**
| Level | Criteria |
|--------|----------|
| 0 | No dashboard. |
| 1 | Sentry/error dashboard (error rate, most frequent errors). |
| 2 | Web Vitals dashboard (LCP, FID/INP, CLS per page). |
| 3 | Complete UX dashboard (errors + performance + usage per feature). |
| 4 | Correlation of errors/performance/deployments. Comparative before/after-release dashboards. |

---

### ob-06 — Distributed traces (OTel, Elastic APM) · Criticality: **COULD**

**Analyze:** OpenTelemetry config, Jaeger, Zipkin, Elastic APM, in-code instrumentation, sampling strategy

**Verification commands:**
```bash
# Check for the presence of tracing
grep -ri "opentelemetry\|@sentry/tracing\|elastic-apm\|jaeger\|zipkin\|@opentelemetry" package.json composer.json requirements.txt go.mod 2>/dev/null
# Look for tracing configuration
grep -ri "TracerProvider\|tracer\|OTEL_\|otel.*exporter\|apm.*agent" --include="*.ts" --include="*.yaml" --include="*.yml" --include="*.env*" --include="*.php" 2>/dev/null | head -10
# Look for custom spans
grep -ri "startSpan\|withSpan\|createSpan\|@Traced\|tracer\.start" --include="*.ts" --include="*.java" --include="*.go" --include="*.py" --include="*.php" 2>/dev/null | head -10
```

**Check:**
- Tracing instrumentation (OpenTelemetry, Elastic APM)
- Context propagation across services (W3C Trace Context)
- Spans on critical operations (DB, HTTP, queues)
- Smart sampling (head-based, tail-based, adaptive)
- Trace visualization (Jaeger, Grafana Tempo)
- Correlation of traces/logs/metrics (exemplars)

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | No tracing. Debugging in production = manual log analysis service by service. |
| 1 | Partial tracing (1-2 services). Manual correlation via timestamps. Gaps in traces. |
| 2 | Tracing on main services with Jaeger/Zipkin. Context propagated but not always exploited. |
| 3 | OpenTelemetry deployed across all services. Complete traces with business spans. Smart sampling. |
| 4 | Traces correlated with logs and metrics (exemplars). Automatic analysis of slow traces. Topology maps generated. |

**Client-side variant (SPA/PWA):**
| Level | Criteria |
|--------|----------|
| 0 | No session or user-journey tracking. |
| 1 | Session ID tracking (session identifier propagated to the backend). |
| 2 | User journey tracking (navigation, clicks, errors correlated per session). |
| 3 | OpenTelemetry browser SDK. Frontend-to-backend traces correlated. |
| 4 | Full session replay with correlation of traces/errors/performance. |

---
name: audit-observability
description: Observability & Alerting audit. Use when auditing logging, metrics, tracing, dashboards, or alerting. Triggers on "audit observabilité", "audit observability", "observability audit", "audit logs", "audit monitoring", "audit alertes", "audit alerting".
version: 1.0.0
metadata:
  last-reviewed: 2026-06-19
  category: audit
---

## When ME and not audit-industrialisation

- **ME** when: audit targeted at this domain only
- **audit-industrialisation** instead if: global multi-domain audit - it orchestrates every audit (including ME) and produces a consolidated report

> For a full project audit, use `audit-industrialisation` rather than invoking each skill separately.

---

# Observability & Alerting Audit

## Overview

Audit a project's observability maturity: structured logs, logging guidelines, contextual baggage, metrics, dashboards, distributed traces, latency tracking, pool saturation, transient-error detection, alerting, notifications, correlation, runbooks, threshold tuning and post-mortems. Covers the OB (Observability, 9 questions) and AL (Alerting, 6 questions) sections, i.e. **15 questions** across 4 thematic grids. Produces a maturity score (0-4) per question.

## Score calculation

- Each scored question receives a level from 0 to 4.
- Questions marked **N/A** are excluded from the calculation.
- **Overall score** = sum of levels / number of scored questions (excluding N/A).
- Formula: `score = Σ(levels) / count(scored questions)`
- Example: 10 scored questions out of 15, sum = 25 → score = 25/10 = 2.5/4

## Audit protocol

1. **Detect the project type**: backend, frontend SPA/PWA, fullstack, library. Use the client-side variant if applicable.
2. **Detect the observability stack**: look for OpenTelemetry, Prometheus, Grafana, ELK, Datadog, Sentry configs
3. **Analyze the logging configuration**: framework, format, levels, correlation, guidelines
4. **Check contextual baggage**: context propagation, automatic enrichment
5. **Check instrumentation**: RED/USE metrics exposed, tracing configured
6. **Look for dashboards**: Grafana configs, links in the docs, hierarchical structure
7. **Analyze latency tracking**: baseline, drift detection, predictive alerts
8. **Check pools**: configurations, metrics, saturation alerts
9. **Examine transient-error detection**: classification, baseline, anomalies
10. **Examine the alert catalog**: classification, owner, runbook, severity
11. **Check notifications**: channels, routing, escalation, failover
12. **Analyze correlation/deduplication**: grouping, inhibition, noise ratio
13. **Check runbooks**: content, links, diagnostic scripts
14. **Analyze threshold tuning**: regular review, metrics, adaptive thresholds
15. **Examine post-mortems**: template, culture, action tracking, recurrence
16. **Check dependencies**: observability packages installed
17. **Run the verification commands** for each question (see per-section grids)
18. **Assign a level** per question with justification and confidence level
19. **Mark N/A** the questions not applicable to the project type
20. **Produce the report**

## Per-section grids

Each grid contains the statement, criticality, the elements to analyze/check, the bash commands and the level tables 0-4 (with a client-side variant where relevant).

- [reference/logging.md](reference/logging.md) - Logs, guidelines, contextual baggage · **3 questions** (ob-01 to ob-03)
- [reference/metriques.md](reference/metriques.md) - RED/USE, latency, pool saturation, transient errors · **4 questions** (ob-04, ob-07, ob-08, ob-09)
- [reference/traces-dashboards.md](reference/traces-dashboards.md) - Real-time dashboards, distributed traces · **2 questions** (ob-05, ob-06)
- [reference/alerting.md](reference/alerting.md) - Catalog, notifications, correlation, runbooks, thresholds, post-mortems · **6 questions** (al-01 to al-06)

### Variants by project type

| Project type | Variant to use | Often-N/A questions |
|----------------|--------------------|-----------------------|
| **Backend / API** | Standard grid (server) | - |
| **Frontend SPA/PWA** | Client-side grid for all questions | ob-03, ob-08 may stay N/A |
| **Fullstack (monorepo)** | Standard for the backend, client-side for the frontend. Two scores possible. | - |
| **Library / SDK** | ob-01 (logs) and ob-02 (guidelines) relevant, the rest often N/A | ob-04 to ob-09, al-01 to al-06 often N/A |
| **CLI / Script** | Simplified standard | ob-03, ob-05, ob-06, ob-08, al-02 to al-06 often N/A |

### Output format

```markdown
## Observability & Alerting - Overall score: X.X/4 (Y questions scored out of 15)

### Summary
[2-3 sentences summarizing observability maturity]
[Detected project type: backend / frontend SPA/PWA / fullstack / library]

### Detail per question

| Code | Question | Criticality | Level | Confidence | Justification |
|------|----------|-----------|--------|-----------|---------------|
| ob-01 | Correlated structured logs | MUST | X | high/medium/low | ... |
| ob-02 | Logging guideline and message structure | SHOULD | X | high/medium/low | ... |
| ob-03 | Analysis and implementation of useful baggage | SHOULD | X | high/medium/low | ... |
| ob-04 | RED/USE metrics | SHOULD | X | high/medium/low | ... |
| ob-05 | Real-time dashboards | SHOULD | X | high/medium/low | ... |
| ob-06 | Distributed traces (OTel, Elastic APM) | COULD | X or N/A | high/medium/low | ... |
| ob-07 | Latency drift tracking | SHOULD | X | high/medium/low | ... |
| ob-08 | Pool saturation (thread, DB, API) | COULD | X or N/A | high/medium/low | ... |
| ob-09 | Abnormal transient-error detection | SHOULD | X or N/A | high/medium/low | ... |
| al-01 | Alert catalog (critical, warning, info) | MUST | X | high/medium/low | ... |
| al-02 | Multi-channel notifications | SHOULD | X | high/medium/low | ... |
| al-03 | Correlation/deduplication (alert fatigue) | SHOULD | X | high/medium/low | ... |
| al-04 | Investigation runbook | SHOULD | X | high/medium/low | ... |
| al-05 | Alert threshold tuning | SHOULD | X | high/medium/low | ... |
| al-06 | Post-mortem template + recurring incidents | SHOULD | X or N/A | high/medium/low | ... |

### Strengths
- ...

### Weaknesses
- ...

### Recommendations
1. [MUST] ...
2. [SHOULD] ...
3. [COULD] ...

### Non-auditable items
- [List of items impossible to verify through static code analysis]
- Examples: SaaS-side Sentry configuration, alerting rules in PagerDuty, hosted Grafana dashboards, SLOs defined outside the repo, post-mortem process, notification tests
```

## Exit condition

The audit is complete when:

- [ ] Project type detected (backend / frontend / fullstack / library / CLI), variant chosen
- [ ] All 15 questions have received a level 0-4 or been marked N/A with justification
- [ ] Verification commands run for each scored question
- [ ] Confidence level (high/medium/low) assigned per question
- [ ] Overall score computed excluding N/A
- [ ] Strengths, weaknesses and prioritized recommendations (MUST/SHOULD/COULD) filled in
- [ ] Non-auditable items listed explicitly

## Changelog

- 1.0.0 (2026-06-19) - initial versioned release + state-of-the-art enrichment (routing, context, protocol, traps, exit condition); audit grids in reference/ (progressive disclosure)

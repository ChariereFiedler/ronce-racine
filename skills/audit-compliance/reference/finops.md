# Section FI - FinOps: Cost Management (11 questions)

## Table of contents

- [FI-01 - Third-party API call cost monitoring](#fi-01--third-party-api-call-cost-monitoring--criticality--should)
- [FI-01a - Cost-tracking granularity](#fi-01a--cost-tracking-granularity--criticality--should)
- [FI-02 - Caching](#fi-02--caching--criticality--should)
- [FI-02a - Cache invalidation strategy](#fi-02a--cache-invalidation-strategy--criticality--should)
- [FI-03 - Superfluous-call detection + batching opportunities](#fi-03--superfluous-call-detection--batching-opportunities--criticality--should)
- [FI-04 - Per-customer cost attribution (tagging)](#fi-04--per-customer-cost-attribution-tagging--criticality--should)
- [FI-05 - Per-customer consumption reporting](#fi-05--per-customer-consumption-reporting--criticality--could)
- [FI-06 - Abuse / abnormal-usage detection](#fi-06--abuse--abnormal-usage-detection--criticality--should)
- [FI-06a - Actions on detected abuse](#fi-06a--actions-on-detected-abuse--criticality--should)
- [FI-07 - Cloud-waste detection and elimination](#fi-07--cloud-waste-detection-and-elimination--criticality--should)
- [FI-08 - Cloud commitment and reservation strategy](#fi-08--cloud-commitment-and-reservation-strategy--criticality--could)

---

### FI-01 - Third-party API call cost monitoring - Criticality: **SHOULD**

**Analyze:** Resource tags, configured budgets, cost alerts, API-call monitoring

**Verification commands:**
```bash
grep -ri "tags\|cost\|budget\|billing" . --include="*.tf" --include="*.yml" --include="*.yaml" 2>/dev/null | head -10
grep -ri "api.*cost\|api.*pricing\|usage.*track\|metering" . --include="*.ts" --include="*.rs" --include="*.py" 2>/dev/null | head -10
```

**Check:**
- Third-party API costs monitored (not just the cloud bill)
- Budget defined and tracked
- Alerts on cost overrun
- Periodic cost review

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | No visibility into costs. Cloud bill not analyzed. |
| 1 | Bill reviewed monthly. No tags. |
| 2 | Resources tagged. Budget defined. Alert on overrun. |
| 3 | FinOps dashboard. Cost per service/feature. Monthly review. |
| 4 | FinOps culture. Continuous optimization. Reserved instances/savings plans. Unit economics. |

---

### FI-01a - Cost-tracking granularity - Criticality: **SHOULD**

**Condition:** Evaluate if FI-01 >= 2

**Analyze:** Level of tracking detail: global, per service, per environment, per customer, per transaction

**Verification commands:**
```bash
grep -ri "cost.*center\|cost.*allocation\|unit.*economic\|cost.*per\|tag.*team\|tag.*project\|tag.*env" . --include="*.tf" --include="*.yml" 2>/dev/null | head -10
```

**Check:**
- Tracking granularity (global → service → environment → customer → transaction)
- Tagging strategy
- Cost centers defined
- Unit economics computed

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | Global cost only. |
| 1 | Per API/service. |
| 2 | Per environment (prod/staging). |
| 3 | Per customer/tenant and per feature. |
| 4 | Per transaction with unit economics. |

---

### FI-02 - Caching - Criticality: **SHOULD**

**Analyze:** Cache strategy, Redis/Memcached configs, CDN, application cache

**Verification commands:**
```bash
grep -ri "redis\|memcached\|cache\|cdn\|cloudfront\|varnish" . --include="*.ts" --include="*.rs" --include="*.yml" --include="*.yaml" --include="*.env*" 2>/dev/null | head -10
grep -ri "spot\|preemptible\|reserved\|savings" . --include="*.tf" --include="*.yml" 2>/dev/null | head -5
```

**Check:**
- Documented cache strategy
- Multi-level cache (CDN, reverse proxy, application, DB)
- Hit rate monitored
- Suitable eviction policy

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | No cache. Every request recomputed. |
| 1 | Basic cache on a few endpoints. No monitoring. |
| 2 | Documented cache strategy. Hit rate > 70%. |
| 3 | Multi-level cache. Hit rate > 90%. Automatic warming. |
| 4 | Smart adaptive cache. Predictive caching. Cost/performance optimized. |

---

### FI-02a - Cache invalidation strategy - Criticality: **SHOULD**

**Condition:** Evaluate if FI-02 >= 2

**Analyze:** Invalidation by TTL, event-driven, write-through, versioning

**Verification commands:**
```bash
grep -ri "invalidat\|cache.*bust\|cache.*clear\|write.through\|cache.aside\|stale.while.revalidate" . --include="*.ts" --include="*.rs" --include="*.py" 2>/dev/null | head -10
```

**Check:**
- Invalidation strategy defined (TTL, event-driven, write-through)
- Freshness/performance/complexity trade-off documented
- Distributed cache consistency if applicable

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | Fixed TTL only. Data potentially stale. |
| 1 | Manual invalidation on request. |
| 2 | Event-driven invalidation for critical cases. |
| 3 | Cache-aside with write-through. Versioning. |
| 4 | Distributed cache consistency. Eventual consistency documented and acceptable. |

---

### FI-03 - Superfluous-call detection + batching opportunities - Criticality: **SHOULD**

**Analyze:** API-call patterns, N+1 queries, excessive retries, batching opportunities

**Verification commands:**
```bash
grep -ri "dataloader\|batch\|bulk\|n.plus.one\|n\+1" . --include="*.ts" --include="*.rs" --include="*.py" 2>/dev/null | head -10
grep -ri "retry.*count\|retry.*max\|retry.*storm" . --include="*.ts" --include="*.rs" --include="*.yml" 2>/dev/null | head -5
```

**Check:**
- Analysis of call patterns (N+1, excessive retries, redundant calls)
- Batching opportunities identified
- DataLoader pattern used if applicable
- Call metrics per endpoint

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | No analysis. Potentially a lot of waste. |
| 1 | Occasional analysis during cost incidents. |
| 2 | Call metrics per endpoint. Manual anomaly detection. |
| 3 | Alerts on abnormal patterns (N+1, retry storms). Quarterly review. |
| 4 | ML detection of inefficiencies. Auto batching suggestions. A/B testing. |

---

### FI-04 - Per-customer cost attribution (tagging) - Criticality: **SHOULD**

**Analyze:** Per-tenant consumption tracking in multi-tenant, cost allocation

**Verification commands:**
```bash
grep -ri "tenant.*cost\|cost.*tenant\|metering\|usage.*track\|billing.*tenant" . --include="*.ts" --include="*.rs" --include="*.py" 2>/dev/null | head -10
grep -ri "cost.*allocat\|chargeback\|showback\|profitability" . --include="*.md" --include="*.yml" 2>/dev/null | head -5
```

**Check:**
- Consumption tracking per customer/tenant
- Resource tagging per tenant
- Per-customer cost reports
- Per-customer profitability analysis
- Per-customer unit economics

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | No attribution. Costs pooled without visibility. |
| 1 | Approximate attribution based on general usage. |
| 2 | Resource tagging per tenant. Manual reports. |
| 3 | Automatic attribution via metrics. Customer dashboard. Cost allocation. |
| 4 | Per-customer unit economics. Profitability analysis. Dynamic pricing ready. |

---

### FI-05 - Per-customer consumption reporting - Criticality: **COULD**

**Analyze:** Customer consumption reports, dashboards, projections

**Verification commands:**
```bash
grep -ri "usage.*report\|consumption.*report\|billing.*dashboard\|client.*report" . --include="*.ts" --include="*.rs" --include="*.py" --include="*.md" 2>/dev/null | head -10
```

**Check:**
- Consumption reports for customers
- Self-service dashboard
- History and trends
- Cost projections
- Optimization recommendations

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | No customer reporting. |
| 1 | Reporting on request. Manual and approximate. |
| 2 | Automated monthly reports. Main metrics. |
| 3 | Self-service dashboard for customers. History and trends. Configurable alerts. |
| 4 | Real-time reporting. Cost prediction. Optimization recommendations. |

---

### FI-06 - Abuse / abnormal-usage detection - Criticality: **SHOULD**

**Analyze:** Rate limiting, quotas, usage-anomaly detection, noisy neighbor

**Verification commands:**
```bash
grep -ri "rate.limit\|throttl\|quota\|abuse\|noisy.neighbor\|fair.usage" . --include="*.ts" --include="*.rs" --include="*.py" --include="*.yml" 2>/dev/null | head -10
grep -ri "anomaly.*detect\|usage.*pattern\|spike.*detect" . --include="*.ts" --include="*.rs" 2>/dev/null | head -5
```

**Check:**
- Rate limiting per customer/tenant
- Quotas configured
- Usage-anomaly detection
- Fair usage policy
- Protection against noisy neighbors

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | No detection. Discovered through impact on other customers. |
| 1 | Basic global rate limiting. No per-customer detection. |
| 2 | Per-customer quotas. Alerts on overrun. Manual throttling. |
| 3 | Anomaly detection on usage patterns. Auto-throttling. Customer notification. |
| 4 | Early ML detection. Automated remediation. Fair usage policies enforced. |

---

### FI-06a - Actions on detected abuse - Criticality: **SHOULD**

**Condition:** Evaluate if FI-06 >= 2

**Analyze:** Abuse-response protocol, graceful degradation, escalation

**Verification commands:**
```bash
grep -ri "abuse.*response\|throttle.*response\|escalat.*abuse\|upgrade.*plan" . --include="*.ts" --include="*.rs" --include="*.md" 2>/dev/null | head -10
```

**Check:**
- Defined response protocol (graceful degradation, no abrupt cutoff)
- Automatic customer notification
- Progressive escalation (throttling → notification → suspension)
- Self-service upgrade option
- Protection of other customers' SLA

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | Nothing. Absorb the cost. |
| 1 | Manual customer contact. Long delay. |
| 2 | Auto throttling + notification. |
| 3 | Defined escalation process. Additional billing possible. |
| 4 | Automated response workflow. Self-service upgrade. SLA protection. |

---

### FI-07 - Cloud-waste detection and elimination - Criticality: **SHOULD**

**Analyze:** Unused resources, orphaned volumes, forgotten environments

**Verification commands:**
```bash
grep -ri "trusted.advisor\|cost.explorer\|advisor\|waste\|unused\|orphan\|idle" . --include="*.tf" --include="*.yml" --include="*.md" 2>/dev/null | head -10
grep -ri "schedule.*stop\|auto.*shutdown\|cleanup.*env" . --include="*.tf" --include="*.yml" --include="*.sh" 2>/dev/null | head -5
```

**Check:**
- Detection of unused resources (idle instances, orphaned volumes)
- Cleanup of forgotten environments (staging, review apps)
- Detection tools (Trusted Advisor, Azure Advisor, Infracost)
- Alerts on under-used resources
- Automatic cleanup policy

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | No visibility into waste. Resources not detected. |
| 1 | Occasional manual checks. Reactive cleanup. |
| 2 | Cloud-provider tools used (Trusted Advisor, Advisor). Periodic reviews. |
| 3 | Automated waste detection. Alerts on unused resources. Cleanup policies. Scheduled reviews. |
| 4 | Continuous optimization platform. Auto-deletion of unused resources. Waste prevention at provisioning time. |

---

### FI-08 - Cloud commitment and reservation strategy - Criticality: **COULD**

**Analyze:** Reserved Instances, Savings Plans, Spot instances, commitment strategy

**Verification commands:**
```bash
grep -ri "reserved.instance\|savings.plan\|spot\|preemptible\|commitment\|reservation" . --include="*.tf" --include="*.yml" --include="*.md" 2>/dev/null | head -10
```

**Check:**
- Use of Reserved Instances / Savings Plans for stable workloads
- Spot instances for flexible workloads
- Analysis of usage patterns to size the commitments
- Optimized on-demand / reserved / spot mix
- Coverage objectives defined (% of workload under reservation)

**Levels:**
| Level | Criteria |
|--------|----------|
| 0 | 100% on-demand. No use of commitments or reservations. |
| 1 | Awareness of reservation options but not used. |
| 2 | A few Reserved Instances for obvious stable workloads. |
| 3 | Systematic analysis of usage patterns. Reserved/Savings/Spot mix. Coverage objectives defined. |
| 4 | Automated reservation management. Dynamic adjustment. Predictive purchasing. 70%+ coverage of stable workloads. |

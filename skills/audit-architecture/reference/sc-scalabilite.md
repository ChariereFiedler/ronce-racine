# Section SC — Technical scalability (7 questions)

## Questions

- SC-01 — Capacity Planning (SHOULD)
- SC-02 — Regular load testing (SHOULD)
- SC-03 — Auto-scaling (horizontal/vertical) (SHOULD)
- SC-04 — Queues/brokers to smooth peaks (SHOULD)
- SC-05 — QoS and processing prioritization (SHOULD)
- SC-06 — Partitioning by client or task (COULD)
- SC-07 — Specialized workers (Split API / ETL) (SHOULD)

---

### SC-01 — Capacity Planning · Criticality: **SHOULD**

**Analyze:** Load models, bottleneck analysis, growth forecasts, cost models

**Verification commands:**
```bash
grep -ri "capacity\|bottleneck\|load.model\|throughput" . --include="*.md" --include="*.yml" 2>/dev/null | head -5
grep -ri "k6\|gatling\|jmeter\|locust" . 2>/dev/null | head -5
```

**Check:** Known system limits, load tests, growth projections, cost per transaction

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No idea of the system's limits. Bottlenecks discovered in production. |
| 1 | Rough estimates based on intuition. No measured data. |
| 2 | Capacity metrics for critical components. Occasional load tests. No forecast. |
| 3 | Documented capacity model. Quarterly load tests. Alerts when nearing limits. |
| 4 | Automated capacity planning with prediction. Growth modeling. Cost optimization built in. |

---

### SC-02 — Regular load testing · Criticality: **SHOULD**

**Analyze:** k6/Gatling/JMeter scripts, CI load testing, soak tests, spike tests

**Verification commands:**
```bash
find . -name "*.k6.*" -o -name "*gatling*" -o -name "*jmeter*" -o -name "*locust*" 2>/dev/null
grep -ri "load.test\|stress.test\|spike.test\|soak.test" . --include="*.yml" --include="*.yaml" --include="*.ts" --include="*.js" 2>/dev/null | head -5
```

**Check:** Test suite (load, stress, spike, soak), prod-like environment, baseline, CI integration

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No load testing. Production = test environment. |
| 1 | Manual tests before a major release. No baseline. Non-representative environment. |
| 2 | Automated tests (k6, Gatling) in CI. Basic scenarios. Comparison against baseline. |
| 3 | Full suite (load, stress, spike, soak). Prod-like environment. Detailed analysis of the results. |
| 4 | Integrated chaos engineering. Testing in production (canary load). Performance budgets enforced. |

---

### SC-03 — Auto-scaling (horizontal/vertical) · Criticality: **SHOULD**

**Analyze:** HPA, KEDA, auto-scaling groups, metrics-based scaling, scale-to-zero

**Verification commands:**
```bash
grep -ri "hpa\|autoscal\|replicas\|keda\|scale.to.zero" . --include="*.yml" --include="*.yaml" --include="*.tf" 2>/dev/null | head -5
ls kubernetes/ helm/ k8s/ 2>/dev/null
```

**Check:** Auto-scaling configured, custom metrics, predictive scaling, scale-to-zero

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | Manual scaling only. Reaction after saturation. |
| 1 | Manual scaling with a documented procedure. Long reaction time. |
| 2 | Auto-scaling configured on basic metrics (CPU). No scale-to-zero. Costs not optimized. |
| 3 | Auto-scaling on custom metrics (queue depth, latency). Documented policies. Cost alerts. |
| 4 | Predictive scaling based on patterns. Spot instances. FinOps built in. Scale-to-zero where relevant. |

---

### SC-04 — Queues/brokers to smooth peaks · Criticality: **SHOULD**

**Analyze:** RabbitMQ, Kafka, SQS, NATS, DLQ, back-pressure

**Verification commands:**
```bash
grep -ri "rabbitmq\|kafka\|sqs\|nats\|amqp\|redis.*queue\|bullmq\|bull" . --include="*.yml" --include="*.yaml" --include="*.ts" --include="*.js" --include="*.php" --include="*.env*" 2>/dev/null | head -10
grep -ri "dead.letter\|dlq\|back.pressure" . 2>/dev/null | head -5
```

**Check:** Message broker configured, DLQ, back-pressure handling, exactly-once processing

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | Everything synchronous. Load peaks = immediate saturation. |
| 1 | Ad-hoc queue for a few jobs. No monitoring. Risk of message loss. |
| 2 | Message broker (RabbitMQ, Kafka) for async workflows. DLQ configured. Basic monitoring. |
| 3 | Event-driven architecture for non-critical operations. Back-pressure handling. Retry policies. |
| 4 | CQRS/Event Sourcing where relevant. Exactly-once processing. Lag metrics with alerts. |

---

### SC-05 — QoS and processing prioritization · Criticality: **SHOULD**

**Analyze:** Priority queues, rate limiting, fair scheduling, preemption

**Verification commands:**
```bash
grep -ri "rate.limit\|throttl\|priority\|qos\|quota" . --include="*.ts" --include="*.js" --include="*.php" --include="*.yml" 2>/dev/null | head -10
grep -ri "PriorityClass\|ResourceQuota" . --include="*.yml" --include="*.yaml" 2>/dev/null | head -5
```

**Check:** Priority queues, rate limiting per tenant/API, fair scheduling, preemption for critical work

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | Everything processed the same. One big batch blocks the small requests. |
| 1 | Manually created separate queues. No dynamic priority. |
| 2 | Priority queues configured. Differentiated timeouts. No per-client throttling. |
| 3 | Rate limiting per tenant/API. Fair scheduling. Wait-time metrics per priority. |
| 4 | Adaptive QoS based on SLOs. Intelligent traffic shaping. Preemption for critical work. |

---

### SC-06 — Partitioning by client or task · Criticality: **COULD**

**Analyze:** Sharding, tenant isolation, cell-based architecture, geographic sharding

**Verification commands:**
```bash
grep -ri "shard\|tenant.id\|multi.tenant\|partition\|cell.based" . --include="*.ts" --include="*.js" --include="*.php" --include="*.yml" 2>/dev/null | head -10
```

**Check:** Tenant isolation, resource quotas, sharding strategy, limited blast radius

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No partitioning. Frequent noisy neighbor problem. |
| 1 | Logical isolation (namespace) with no resource guarantee. |
| 2 | Resource quotas per tenant. No physical sharding. |
| 3 | Sharding per tenant for large clients. Dedicated resources for VIPs. Monitoring per shard. |
| 4 | Complete multi-tenant isolation. Cell-based architecture. Limited blast radius. Multi-region compliance. |

---

### SC-07 — Specialized workers (Split API / ETL) · Criticality: **SHOULD**

**Analyze:** API/workers/batch separation, read replicas, CQRS, async processing

**Verification commands:**
```bash
grep -ri "worker\|sidekiq\|celery\|bull\|queue.*process\|cron\|schedule" . --include="*.yml" --include="*.yaml" --include="*.ts" --include="*.php" 2>/dev/null | head -10
grep -ri "read.replica\|cqrs\|async.*process" . 2>/dev/null | head -5
```

**Check:** Dedicated workers per task type, resource isolation, read replicas for ETL, independent scaling

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | Single monolith. ETL and API share the same resources. |
| 1 | Logical separation (dedicated threads). No real isolation. |
| 2 | Separate services but same infra. Possible contention on DB/network. |
| 3 | Dedicated workers with independent scaling. Separate queues. Distinct metrics. |
| 4 | Fully decoupled architecture. Read replicas for ETL. Zero API impact during batch. |

---

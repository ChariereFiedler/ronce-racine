# Resilience & chaos section

Questions: te-04 (Chaos testing), te-05 (Third-party API outage simulation), te-06 (Historical batch replay).

## Table of contents

- [te-04 — Chaos testing](#te-04--chaos-testing--could)
- [te-05 — Third-party API outage simulation](#te-05--third-party-api-outage-simulation--should)
- [te-06 — Historical batch replay](#te-06--historical-batch-replay--could)

---

### te-04 — Chaos testing — `could`

**Analyze:** Chaos Monkey, Litmus, Gremlin configs, failure-simulation scripts, game days

**Commands:**
- `grep -ri "chaos\|gremlin\|litmus\|chaos.monkey\|toxiproxy" package.json docker-compose*.yml 2>/dev/null` → chaos-testing tools
- `find . -name "*chaos*" -o -name "*resilience*" 2>/dev/null | grep -v node_modules | head -10` → chaos-related files
- `grep -ri "game.day\|disaster.recovery\|chaos" docs/ 2>/dev/null | head -5` → chaos/resilience documentation
- `grep -ri "circuit.breaker\|fallback\|timeout\|retry" src/ lib/ 2>/dev/null | head -10` → resilience patterns in the code
- `grep -ri "steady.state\|hypothesis" docs/ 2>/dev/null | head -5` → documented resilience hypotheses

**Check:**
- Chaos-engineering practice (even basic)
- Failure simulation (kill service, network latency, DB loss)
- Planned game days
- Documented resilience hypotheses (steady-state)

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No chaos testing. Weaknesses discovered in production. |
| 1 | Occasional manual service-kill tests. |
| 2 | Basic chaos monkey in a non-prod environment. Limited scenarios. |
| 3 | Chaos test suite (Gremlin, LitmusChaos). Quarterly game days. Documented hypotheses. |
| 4 | Chaos engineering in production (controlled). Automated steady-state verification. Continuous chaos. |

---

### te-05 — Third-party API outage simulation — `should`

**Analyze:** API resilience tests, fault proxies (Toxiproxy, WireMock), circuit breakers, fallbacks, timeout tests

**Commands:**
- `grep -ri "toxiproxy\|wiremock\|mockserver\|nock\|msw\|mock.service.worker" package.json 2>/dev/null` → simulation tools
- `grep -ri "circuit.breaker\|circuitbreaker\|fallback\|resilience4j\|polly\|opossum" . --include="*.ts" --include="*.js" --include="*.java" --include="*.php" 2>/dev/null | grep -v node_modules | head -10` → resilience patterns
- `grep -ri "timeout\|TIMEOUT\|connectTimeout\|readTimeout" . --include="*.ts" --include="*.js" --include="*.env*" --include="*.php" 2>/dev/null | grep -v node_modules | head -10` → timeout configuration
- `grep -ri "fault.*inject\|inject.*fault\|chaos.*mesh" . 2>/dev/null | grep -v node_modules | head -5` → fault injection
- `grep -ri "mock.*api\|stub.*api\|fake.*api" . --include="*.test.*" --include="*.spec.*" 2>/dev/null | grep -v node_modules | head -10` → API mocks in the tests

**Check:**
- Simulation of third-party API outages (latency, errors, timeout)
- Circuit breakers configured and tested
- Fallbacks functional and validated
- Automated tests of degradation scenarios

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | Never simulated. Behavior unknown if an API is down. |
| 1 | Occasional manual test (unplug the network). |
| 2 | API mocking with fault injection. Basic automated tests. |
| 3 | Systematic fault injection (latency, errors, timeouts). Fallback validation. |
| 4 | Toxiproxy/Chaos Mesh integrated. Tests of every failure combination. Automated recovery validation. |

---

### te-06 — Historical batch replay — `could`

**Analyze:** Ability to replay past processing, shadow traffic, result comparison, data pipelines

**Commands:**
- `grep -ri "replay\|rejeu\|shadow\|reprocess" . --include="*.sh" --include="*.py" --include="*.ts" --include="*.php" 2>/dev/null | grep -v node_modules | head -10` → replay scripts
- `grep -ri "batch\|etl\|cron\|schedule\|queue\|job" . --include="*.php" --include="*.ts" --include="*.py" 2>/dev/null | grep -v node_modules | head -10` → batch/cron processing
- `find . -name "*batch*" -o -name "*etl*" -o -name "*migration*" -o -name "*replay*" 2>/dev/null | grep -v node_modules | head -10` → batch-related files
- `grep -ri "idempoten\|deterministic\|replayable" . 2>/dev/null | grep -v node_modules | head -5` → replayability patterns
- `grep -ri "temporal\|airflow\|flink\|dbt" package.json docker-compose*.yml 2>/dev/null` → orchestration tools

**Check:**
- Ability to replay past processing with the original data
- Anonymized historical data available for replay
- Automatic result comparison (old vs new)
- Idempotency of batch processing

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No replay capability. Tests with synthetic data only. |
| 1 | Manual replay possible but complex. No process. |
| 2 | Replay capability on a dedicated environment. Anonymized data. |
| 3 | Automated replay pipeline. Comparison against expected results. Performance metrics. |
| 4 | Shadow traffic in production. A/B testing of changes. Automatic regression detection. |

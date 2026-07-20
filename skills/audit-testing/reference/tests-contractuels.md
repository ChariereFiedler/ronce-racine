# Contract testing section

Questions: te-01 (Contract testing with third-party APIs), te-01a (Coverage of tested contracts).

## Table of contents

- [te-01 - Contract testing with third-party APIs](#te-01--contract-testing-with-third-party-apis--could)
- [te-01a - Coverage of tested contracts](#te-01a--coverage-of-tested-contracts--could)

---

### te-01 - Contract testing with third-party APIs - `could`

**Analyze:** Pact tests, contract tests, external API mocks, `.pact/` files, contract-testing configs, OpenAPI schema validation

**Commands:**
- `grep -r "pact\|contract" package.json 2>/dev/null` → detect Pact or contract testing
- `find . -path "*/.pact/*" -o -name "*contract*test*" -o -name "*pact*" 2>/dev/null | grep -v node_modules | head -10` → contract test files
- `grep -ri "spring.cloud.contract\|contract.verifier" pom.xml build.gradle 2>/dev/null` → Spring Cloud Contract
- `grep -ri "consumer.*driven\|provider.*verification" . --include="*.ts" --include="*.js" 2>/dev/null | head -5` → CDC patterns
- `grep -ri "openapi\|swagger\|json.schema\|spectral\|prism" . --include="*.json" --include="*.yaml" --include="*.yml" 2>/dev/null | grep -v node_modules | head -5` → API schema validation

**Check:**
- Presence of contract tests (Pact, Spring Cloud Contract)
- Consumer-Driven Contracts for consumed APIs
- Schema validation (OpenAPI, JSON Schema)
- Bidirectional tests (provider + consumer)

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No contract tests. Breaking changes discovered in production. |
| 1 | Occasional manual tests against the APIs. No CI. |
| 2 | Versioned API-response snapshots. Manual or semi-automated comparison. |
| 3 | Contract testing (Pact, Spring Cloud Contract) integrated into CI. Drift alerts. |
| 4 | Consumer-driven contracts. Bidirectional tests. Automatic breaking-change prevention. |

---

### te-01a - Coverage of tested contracts - `could`

**Condition:** Applies if te-01 ≥ 2 (contract testing in place).

**Analyze:** Coverage matrix of third-party APIs, integration inventory, prioritization by business criticality

**Commands:**
- `grep -ri "pact\|contract\|api.*test" . --include="*.test.*" --include="*.spec.*" 2>/dev/null | grep -v node_modules | wc -l` → number of contract tests
- `grep -ri "http\|fetch\|axios\|guzzle\|curl" . --include="*.ts" --include="*.js" --include="*.php" --include="*.py" 2>/dev/null | grep -v node_modules | grep -v test | head -20` → API calls in the source code
- `find . -name "*.pact.json" -o -name "*contract*.json" 2>/dev/null | grep -v node_modules | head -10` → published contracts
- `grep -ri "can.i.deploy\|pactflow\|pact.broker" . 2>/dev/null | head -5` → contract broker and can-i-deploy

**Check:**
- Percentage of third-party APIs covered by contract tests
- Maintained coverage matrix (APIs vs tests)
- Risk-based prioritization (critical APIs covered first)
- Auto-discovery of new uncovered integrations

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No API covered. |
| 1 | Critical APIs only (payment, auth). |
| 2 | Main APIs (>50% of traffic). |
| 3 | All APIs with an SLA. Coverage matrix maintained. |
| 4 | 100% of integrations. Auto-discovery of new endpoints. |

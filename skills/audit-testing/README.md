# `audit-testing`

> Score a project's testing maturity across 13 questions and five sections, from unit-test structure to chaos engineering, on a 0-4 scale.

| | |
|---|---|
| **Type** | Skill (on-demand audit) |
| **Category** | `audit` |
| **Artifact** | [`SKILL.md`](SKILL.md) |
| **Tooling** | Bash verification commands + progressive-disclosure grids in [`reference/`](reference/) |

## What it is

`audit-testing` is a structured maturity assessment for a project's **test strategy and validation practices**. It walks 13 questions grouped into five sections — contract testing, golden dataset, E2E & flaky tests, resilience & chaos, and unit/integration/CI tests — and scores each one from 0 (absent) to 4 (state of the art). The output is a scored report with strengths, weaknesses, prioritized recommendations, and an explicit list of what could not be verified statically.

It is one of eight domain audits orchestrated by [`audit-industrialisation`](../audit-industrialisation/). Invoked on its own, it covers testing only.

## Why it exists

Test suites rot silently. A project can have thousands of green tests and still be fragile: no integration coverage against a real database, flaky E2E tests that everyone retries until they pass, no simulation of a third-party API going down, no way to replay a historical batch. A single "coverage %" number hides all of this.

This skill replaces gut feeling with a **repeatable rubric**. Every question has explicit bash checks and a five-level scale, so two auditors reach comparable scores, and the same project can be re-audited over time to see whether maturity is actually improving.

## When it triggers

Invoke it when someone asks for a testing-focused audit:

- "audit tests", "audit testing"
- "test coverage audit", "test quality audit"
- a request to assess test strategy, the test pyramid, flaky-test handling, chaos testing, or a test plan before a release

For a full multi-domain project audit, use [`audit-industrialisation`](../audit-industrialisation/) instead — it runs this skill along with the seven others and consolidates the results.

## How it works

### Scoring model

- **Domain score** = average of scored questions, excluding N/A.
- A question is **N/A** when the project profile makes it irrelevant (no third-party API → te-01/te-01a/te-05 N/A; no batch processing → te-06 N/A).
- **Conditional sub-questions** (te-01a, te-02a, te-03a, te-09a) are only scored if their parent reaches level ≥ 2.
- Weighting by criticality — **must** (weight 3): te-07, te-08, te-09; **should** (weight 2): te-02, te-02a, te-03, te-03a, te-05, te-09a; **could** (weight 1): te-01, te-01a, te-04, te-06.
- Weighted score = `sum(level × weight) / sum(weight)` over the scored questions.

### Audit protocol

The skill detects the test frameworks and counts test files by type, reads the coverage configs and CI stages, then runs each question's verification commands — scoring the conditional sub-questions only when their parent reaches level ≥ 2 — and inspects the test pyramid and resilience patterns before assigning levels, marking N/A, listing non-auditable items and producing the report.

Full step-by-step protocol → [`SKILL.md`](SKILL.md).

### The five reference grids

Each grid holds, per question: the statement, what to analyze, what to check, the bash commands, and the 0-4 level table.

| Section | Grid | Questions |
|---------|------|-----------|
| Contract testing | [`reference/tests-contractuels.md`](reference/tests-contractuels.md) | te-01, te-01a |
| Golden dataset | [`reference/golden-dataset.md`](reference/golden-dataset.md) | te-02, te-02a |
| E2E & flaky tests | [`reference/tests-e2e-flaky.md`](reference/tests-e2e-flaky.md) | te-03, te-03a |
| Resilience & chaos | [`reference/resilience-chaos.md`](reference/resilience-chaos.md) | te-04, te-05, te-06 |
| Unit, integration & CI | [`reference/tests-unit-integ-ci.md`](reference/tests-unit-integ-ci.md) | te-07, te-08, te-09, te-09a |

### Confidence levels

Each score carries a confidence: **high** (verified by an executed command or a direct file read), **medium** (inferred from structure but not deeply verified), or **low** (needs an interview or external access such as a coverage dashboard or historical reports).

## Worked example

> You audit `acme-app`, a backend service that talks to a third-party payment provider.

1. te-07: `find` counts 420 `*.spec.ts` files, `vitest.config.ts` sets a 80% branch threshold → **level 3, high confidence**.
2. te-08: Testcontainers spins up a real Postgres in the integration suite → **level 3, high confidence**.
3. te-03: a Playwright config exists but CI marks the E2E job `allow_failure: true` and three specs are `test.skip` → **level 2, high confidence**; te-03a triggers (parent ≥ 2) and, with no quarantine process, scores **level 1**.
4. te-05: the payment provider is never simulated — no Toxiproxy, no WireMock, no circuit breaker in the source → **level 0, medium confidence**, flagged as a top recommendation.
5. te-06 is marked **N/A** (no batch processing in `acme-app`).

The domain score is the weighted average of the scored questions, and te-05 lands in the `[MUST]`/`[SHOULD]` recommendations because an unsimulated payment dependency is a real resilience gap.

## Related artifacts

- [`audit-industrialisation`](../audit-industrialisation/) — orchestrates this audit and seven others into one consolidated report.
- [`audit-quality`](../audit-quality/) — QA & DevOps plus data quality; overlaps on coverage and CI but from a broader delivery angle.
- [`audit-report`](../audit-report/) — the consolidated report template and scoring rules.

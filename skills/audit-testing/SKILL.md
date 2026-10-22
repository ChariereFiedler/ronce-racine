---
name: audit-testing
description: Testing & Validation audit. Use when auditing test strategy, coverage, test types, flaky tests, chaos testing, or test plans. Triggers on "audit tests", "audit testing", "audit couverture", "test coverage audit", "audit qualité tests", "test quality audit".
version: 1.0.1
metadata:
  last-reviewed: 2026-07-20
  category: audit
---

# Testing & Validation Audit

## When ME and not audit-industrialisation

- **ME** when: an audit targeting this domain only
- **audit-industrialisation** instead if: a global multi-domain audit - it orchestrates every audit (including ME) and produces a consolidated report

> For a full project audit, use `audit-industrialisation` rather than invoking each skill separately.

## Overview

Audit the maturity of a project's testing practices: coverage, test pyramid, stability, contract testing, chaos engineering, golden dataset, batch replay and CI feedback loop. Produces a maturity score (0-4) per question.

**13 questions** split into 5 sections. The detailed grids (statement, checks, commands, levels 0-4) live in `reference/` - see [Grids by section](#grids-by-section).

## Score calculation

- The score rule itself is in the shared apparatus (see [Report apparatus](#report-apparatus))
- A question is N/A if the project profile makes it non-applicable (e.g. no third-party API → te-01/te-01a/te-05 N/A, no batch → te-06 N/A)
- Conditional sub-questions (te-01a, te-02a, te-03a, te-09a) are N/A if their parent question does not reach the required level
- Criticality (used to prioritize remediation, NOT in the score - see `audit-report/reference/scoring-model.md`):
  - **must**: te-07, te-08, te-09
  - **should**: te-02, te-02a, te-03, te-03a, te-05, te-09a
  - **could**: te-01, te-01a, te-04, te-06

## Audit protocol

1. **Detect the test frameworks**: run the te-07 and te-03 commands to find the configs
2. **Count test files** by type (unit, integration, e2e) via the dedicated commands
3. **Read the coverage configs** and thresholds
4. **Check the CI pipeline** for test stages (te-09 commands)
5. **Run the verification commands** for every question te-01 to te-09a
6. **Evaluate the conditional sub-questions**: te-01a (if te-01 ≥ 2), te-02a (if te-02 ≥ 2), te-03a (if te-03 ≥ 2), te-09a (if te-09 ≥ 2)
7. **Look for patterns**: retries, skip, quarantine, fixtures, factories, seeds, circuit breakers, fallbacks
8. **Examine the ratio** unit/integ/e2e (test pyramid)
9. **Assign a level** per question with a justification and a confidence level
10. **Mark N/A** the questions non-applicable to the project profile
11. **List the non-auditable items** requiring an interview or external access
12. **Produce the report** in the shared output format (see [Report apparatus](#report-apparatus))

## Grids by section

Each file contains the statement, the items to analyze/check, the bash commands and the tables of levels 0-4.

| Section | Reference | Questions | Count |
|---------|-----------|-----------|-------|
| Contract testing | [reference/tests-contractuels.md](reference/tests-contractuels.md) | te-01, te-01a | 2 |
| Golden dataset | [reference/golden-dataset.md](reference/golden-dataset.md) | te-02, te-02a | 2 |
| E2E & flaky tests | [reference/tests-e2e-flaky.md](reference/tests-e2e-flaky.md) | te-03, te-03a | 2 |
| Resilience & chaos | [reference/resilience-chaos.md](reference/resilience-chaos.md) | te-04, te-05, te-06 | 3 |
| Unit, integration & CI tests | [reference/tests-unit-integ-ci.md](reference/tests-unit-integ-ci.md) | te-07, te-08, te-09, te-09a | 4 |

## Report apparatus

Read `../audit-report/reference/apparatus.md` before writing the report: the score rule, the criticality and confidence levels, the handling of non-auditable items and the output skeleton live there and nowhere else. Domain title `Testing & Validation`, 13 questions: one row per code listed in [Grids by section](#grids-by-section).

## Exit condition

- [ ] Test frameworks detected, files counted by type
- [ ] All 13 questions evaluated (or justified N/A)
- [ ] Conditional sub-questions evaluated if parent ≥ 2 (te-01a, te-02a, te-03a, te-09a)
- [ ] Verification commands executed for every scored question
- [ ] Level (0-4) + confidence + justification per question
- [ ] Domain score calculated (average excluding N/A, "X scored out of Y")
- [ ] Report produced in the output format
- [ ] Non-auditable items listed

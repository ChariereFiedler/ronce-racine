---
name: comprehensive-test-strategy
description: Use when defining or auditing the test strategy of a module or whole project - building a coverage matrix by risk, choosing the test pyramid split, prioritizing what to test first, deciding which surfaces deserve which test level - "define the test strategy", "définis la stratégie de test", "coverage matrix by risk", "matrice de couverture". Not for writing the tests of one targeted file.
version: 1.0.0
metadata:
  last-reviewed: 2026-06-19
  category: test
---

# Comprehensive Test Strategy - what to test, at which level, in what order

> If the current repo has a project-specific test-strategy skill, it wins - it knows the surfaces, the commands and the project's tracker.

## This skill vs. others

- **This skill** when: "test strategy", "full coverage", "where to start", auditing/designing the strategy of a module or project, mapping the surfaces and prioritizing. Output = a **matrix** + an **ordered plan**, not test code.
- **`writing-robust-tests`** instead if: the target is **one specific file** whose tests must be written/hardened (ISTQB design, page object, proof of failure).
- **`superpowers:test-driven-development`** instead if: the code does not exist yet (test first, red-green loop on a feature).
- Normal flow: this skill produces the matrix + the plan → case-by-case delegation to `writing-robust-tests` or TDD.

## Principle

- **Map before executing** - every testable surface identified and classified before writing a single assertion.
- **Risk-based prioritization** - security, data integrity and multi-tenant isolation first; cosmetics last. The test budget goes where an incident costs the most.
- **Conscious level choice** - the pyramid (unit / integration-contract / E2E) is a deliberate cost/confidence trade-off, not a reflex.
- **A declared gap beats false coverage** - a green test that does not exercise the intended path is worse than an identified hole.

## Context to gather (before acting)

- Framework(s) + commands: read `package.json` / `Cargo.toml` / `Makefile` / `pyproject.toml` / CI config.
- Project surfaces: pages/screens, API endpoints (OpenAPI/routes), persisted entities and their invariants, authorization/isolation boundaries.
- Existing tests: locate them (`*.spec.*`, `*.test.*`, `tests/` folders), read a neighbour to copy its conventions.
- The current coverage baseline if any, and the thresholds (quality gates) already in place.

## Protocol

1. **Map the surfaces.** List everything testable: API routes, screens, forms, error pages (missing resource, ID from another org), business invariants, isolation boundaries. One matrix row per surface.
2. **Classify by risk (priority P0/P1/P2).**
   - **P0**: authentication, authorization, multi-tenant isolation, data integrity/loss, payment. A defect here = security incident or corruption.
   - **P1**: main business journeys, form validation (client + server), API contracts, error states.
   - **P2**: sort/filter/pagination, empty states, cosmetics, rare low-impact cases.
3. **Choose the level (pyramid ~70/20/10).**
   - **~70% unit**: pure logic, invariants, branches - fast, no I/O.
   - **~20% integration-contract**: handlers + persistence, API contract (snapshot), authorization policies against a real database.
   - **~10% E2E**: critical end-to-end journeys, real backend + seeded data. Expensive and slow → reserved for the highest-risk paths.
   - Justify every placement high in the pyramid: an E2E that could have been a contract test is waste.
4. **Gap analysis.** For each row: `Covered` (existing test) / `Partial` (exists but misses cases) / `Absent`. Produce the `Surface · Priority · Level · State · Action` report.
5. **Ordered execution plan.** P0 first (blocking: create them if missing), then P1, then P2. For each planned-but-absent entry, create a follow-up ticket (via the project tracker) rather than writing everything at once.
6. **Delegation.** Hand each surface to cover to `writing-robust-tests` (existing code) or the TDD flow (code to write). This skill does not descend to the file level.

Copy-paste checklist:
```
- [ ] Surfaces mapped (one matrix row each)
- [ ] Each surface classified P0/P1/P2 by risk
- [ ] Test level chosen and justified (70/20/10 pyramid)
- [ ] Gap analysis: Covered / Partial / Absent per surface
- [ ] Ordered plan P0 → P1 → P2, tickets created for the absent ones
- [ ] Surfaces delegated to the right skill (writing-robust-tests / TDD)
```

## Templates

Coverage matrix (header to fill in):

| Surface | Level | Framework | Priority | State | Action |
|---------|--------|-----------|----------|------|--------|
| Authentication (login/logout/refresh) | E2E + contract | (to fill in) | P0 | Partial | complete refresh |
| Isolation between organizations/tenants | integration + E2E | (to fill in) | P0 | Absent | create |
| API endpoint contract | snapshot/contract | (to fill in) | P0/P1 | … | … |
| Form validation (client + server) | unit + E2E | (to fill in) | P1 | … | … |
| Error pages (non-existent ID, resource of another tenant) | E2E | (to fill in) | P1 | … | … |
| Business invariants | unit | (to fill in) | P1 | … | … |
| Lists (sort/filter/pagination/empty state) | unit + E2E | (to fill in) | P2 | … | … |

Expected output (final summary):
```
Matrix : X surfaces identified
Risk   : a P0 | b P1 | c P2
Gaps   : Y absent | Z partial
Plan   : N P0 tests to create (blocking), M P1 tests
Tickets: <list of follow-up tickets created>
```

## Traps & rationalizations

| Excuse | Reality |
|--------|---------|
| "We test everything the same, we'll figure out the order later" | Without risk prioritization the budget drains into cosmetics while tenant isolation stays bare. P0 first, always. |
| "Let's do everything in E2E, it's the most realistic" | E2E = slow, fragile, expensive. The majority must be unit. An E2E that could have been a contract test is waste. |
| "Coverage is at 85%, so it's covered" | The % does not tell you whether the risky path is exercised. A test that does not break when you break the code covers nothing. |
| "We mock the whole API to make it stable" | An E2E with a fully-mocked API becomes a UI test: it will never catch a backend contract break. |
| "No time to map, I'm starting to write" | Without a matrix you test what is easy, not what is risky. The map is the output, not a preamble. |

## Exit condition

- [ ] Complete matrix: all testable surfaces listed and classified by risk.
- [ ] Each surface has a justified test level (roughly respecting the pyramid).
- [ ] Gap analysis produced (Covered / Partial / Absent) with actions.
- [ ] Ordered plan P0 → P1 → P2; follow-up tickets created for the absent ones.
- [ ] Surfaces to cover delegated to the right skill (never write the tests here).

## Tooling

- `reference/testing-advanced.md` - advanced techniques loaded on demand: quality gates, mutation testing, fuzzing, API snapshots, UAT, pyramid detail. Read it when the strategy must rely on automated safeguards.

## Changelog

- 1.0.0 (2026-06-19) - initial release, generalized from a project workflow (coverage matrix, risk prioritization, pyramid), stack/tracker coupling removed.

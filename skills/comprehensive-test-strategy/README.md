# `comprehensive-test-strategy`

> Decide what to test, at which level, and in what order — a risk-ranked coverage matrix and an ordered plan for a module or a whole project, before a single assertion is written.

| | |
|---|---|
| **Type** | Skill (planning workflow) |
| **Category** | `test` |
| **Artifact** | [`SKILL.md`](SKILL.md) |
| **Reference** | [`reference/testing-advanced.md`](reference/testing-advanced.md) (progressive disclosure) |
| **Tooling** | None (analysis + delegation; inline matrix template) |

## What it is

`comprehensive-test-strategy` is a **planning** discipline, not a test-writing one. Its output is a **coverage matrix** (one row per testable surface) and an **ordered execution plan** — never test code. It maps every surface a system exposes, ranks each by risk, assigns a test level from the pyramid, marks whether it is Covered / Partial / Absent, and hands the work off to the skills that actually write tests.

## Why it exists

Left to instinct, teams test **what is easy, not what is risky**: cosmetics get covered while multi-tenant isolation stays bare, and an 85%-coverage badge hides the fact that the dangerous path is never exercised. This skill forces four commitments:

- **Map before executing** — the matrix is the deliverable, not a warm-up.
- **Risk-based budget** — security, data integrity and tenant isolation (P0) come before empty states and pagination (P2).
- **Conscious level choice** — the ~70/20/10 pyramid is a cost/confidence trade-off; an E2E that could have been a contract test is waste.
- **A declared gap beats false coverage** — a green test that does not exercise the intended path is worse than an identified hole.

## When it triggers

Invoke it for "test strategy", "full coverage", "where to start" — auditing or designing the strategy of a module or project, mapping surfaces and prioritizing.

- Use **`writing-robust-tests`** instead when the target is **one specific file** to write/harden.
- Use **`superpowers:test-driven-development`** instead when the code does not exist yet (test-first, red-green).
- Normal flow: this skill produces the matrix + plan, then delegates surface by surface to `writing-robust-tests` or TDD.

## How it works

The skill maps every surface a system exposes, ranks each by risk (P0 security/isolation/data-loss → P2 cosmetics), assigns a level from the ~70/20/10 pyramid, and marks it Covered / Partial / Absent — producing a coverage matrix and an ordered P0→P1→P2 plan, never test code. Each surface is then delegated to `writing-robust-tests` or TDD; a declared gap always beats false coverage, and the skill never descends to the file level itself.

Full step-by-step protocol (risk tiers, pyramid budget, delegation) → [`SKILL.md`](SKILL.md).

### Coverage matrix (template)

| Surface | Level | Framework | Priority | State | Action |
|---------|--------|-----------|----------|------|--------|
| Authentication (login/logout/refresh) | E2E + contract | (fill in) | P0 | Partial | complete refresh |
| Isolation between organizations/tenants | integration + E2E | (fill in) | P0 | Absent | create |
| API endpoint contract | snapshot/contract | (fill in) | P0/P1 | … | … |

When the strategy needs automated safeguards, load [`reference/testing-advanced.md`](reference/testing-advanced.md): quality gates, mutation testing, parser fuzzing, API snapshots, UAT, and multi-agent confidence metrics.

## Worked example

> `acme-app` is a multi-tenant SaaS at 85% line coverage; a leadership request asks "are we actually safe?"

1. Mapping surfaces reveals a **P0** row "Isolation between organizations" that is **Absent** — the 85% never touched it.
2. It is placed at integration + E2E level and put **first** in the ordered plan as blocking.
3. Form validation (P1) is Partial (client only, server missing) → action: add server-side contract tests.
4. Pagination and empty states (P2) are deferred. A follow-up ticket is opened for each absent surface, then the isolation row is delegated to `writing-robust-tests`.

The output is a matrix + plan, not the tests themselves.

## Related artifacts

- [`writing-robust-tests`](../writing-robust-tests/) — writes/hardens the tests for a single file once this skill has prioritized it.
- the Superpowers `test-driven-development` skill — the red-green loop for code that does not exist yet.

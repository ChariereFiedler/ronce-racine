---
name: detection-sweep
description: Use when asked to check the whole project and report problems - "check the whole project", "detect the problems", "run a sweep", "vérifie tout le projet", "détecte les problèmes", "lance un sweep", periodic health check of a codebase, before a release audit.
version: 1.0.2
metadata:
  last-reviewed: 2026-07-20
  category: audit
---

# Detection Sweep - detect, ticket, fix nothing

> If the current repo has a specific sweep skill (e.g. acme-app → `test-sweep`), it wins - it knows the project's blocks and tracker.

## This skill vs. others

- **This skill** when: sweeping the whole project and reporting problems (periodic health check, pre-release audit) - detection without fixing
- **`writing-robust-tests`** instead if: covering a targeted file, not auditing the whole
- **`bug-ticket-root-cause`** instead if: a single observed bug to document in depth

## Principle

**Detection only.** A sweep that fixes along the way is no longer a sweep: its report becomes unverifiable and the unreviewed fixes ship without a ticket. The output = tickets in the tracker + a report, **zero code changes**.

## 1. Build the list of blocks (adapt to the project)

Detect the available checks: `package.json` scripts, `Makefile`, `Cargo.toml`, CI config (`.gitlab-ci.yml`, `.github/workflows/`). Order: fastest to slowest:

1. Compilation / typecheck (per stack)
2. Lint (per stack)
3. Unit tests (per stack)
4. Integration tests / API contracts
5. E2E
6. Dependency security audit (`npm audit`, `cargo audit`, `pip-audit`…)

**Run ALL the blocks**, even after failures - a partial sweep gives a false picture of health. Parallelize independent blocks.

## 2. One failure = one ticket in the tracker

Not a report paragraph, not a "recommended action": **a ticket created** (GitLab/GitHub/Jira depending on the repo - use the project's CLI if it has one, otherwise `glab`/`gh`/API).

Granularity: 1 ticket per distinct cause (12 mypy errors of the same kind = 1 ticket; 2 tests failing for 2 reasons = 2 tickets).

Mandatory content: reproduction command · error output · files involved · block and sweep date · labels (`bug`, `needs-triage`, `sweep`).

**Anti-duplicate**: before creating, extract a signature (file + message) and search the open tickets under the `sweep` label - if found, comment instead of duplicating.

**Creation cap (`--cap`, default 5)**: create only the N highest-priority tickets per pass, so as not to drown feature work under debt. Sort by severity (blocking > MUST > SHOULD), create up to the cap, and **explicitly list the capped causes** ("8 detected, 5 created, 3 capped") for the next pass - a cap does not erase the rest, it visibly defers it.

## 3. Final report

Table block | status | tickets created, then the list of tickets with numbers, total and duration. If a block was skipped (unavailable locally, too long), **say so explicitly** - an un-run block is not a green block.

## Forbidden rationalizations

| Excuse | Reality |
|--------|---------|
| "It's an obvious one-line fix" | That's exactly how a sweep drifts. Ticket it. The fix will take 2 min… in a reviewed branch. |
| "A report is enough, I'll ticket later" | "Later" never comes. Actions with no ticket number get lost (verified: 4 P1 actions lost that way). |
| "12 errors = 12 tickets, that's too many" | Group by cause, not by occurrence. But grouping ≠ omitting. |
| "The CVE, I'll run npm audit fix" | That's a code change. Ticket it with the proposed command inside. |

## Red flags - STOP

- An Edit/Write on a code file during the sweep
- A `git commit` during the sweep
- The final report contains "recommendations" with no ticket number against them

## Exit condition

- [ ] All detected blocks were run (or explicitly marked skipped in the report)
- [ ] Each failure has a ticket in the tracker (1 per cause), with repro + error output + files
- [ ] Anti-duplicate checked (`sweep` label) before each creation
- [ ] **Zero code changes, zero commits** during the sweep
- [ ] Final report: table block | status | tickets, list of numbers, total and duration

## Common options

Workflow directives for the sweep as a whole (state them when invoking the skill - they are NOT `sweep.ts` flags):
`--dry-run` (show without creating) · `--quick` (static blocks only) · `--skip <block>` (note it in the report) · `--cap N` (cap on tickets created per pass, default 5).

## Tooling

- Test procedure: `scripts/sweep.test.ts` - deterministic behavioral test of the script (positive + negative fixture). Run `npx tsx scripts/sweep.test.ts` from the canonical repo after any change to the script (also picked up by `npm test`). Not distributed to target repos.

- `scripts/sweep.ts [path]` - read-only detection sweep (`npx tsx scripts/sweep.ts`); its only argument is the path to scan. Detects: flagged debt (TODO/FIXME, lint suppressions), debug leftovers, fragile/disabled tests, swallowed errors, potential secrets, large files. Produces a report to triage (1 ticket per cause, not per occurrence).

## Changelog

- 1.0.2 (2026-07-20) - co-located test procedure for sweep.ts (scripts/sweep.test.ts)

- 1.0.1 (2026-07-20) - workflow directives clarified as skill options, not sweep.ts flags

- 1.0.0 (2026-06-19) - initial versioned release + state-of-the-art enrichment (routing, context, protocol, traps, exit condition)

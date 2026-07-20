# `detection-sweep`

> Sweep the whole project, turn every failure into a tracker ticket, and change zero lines of code — detection, never repair.

| | |
|---|---|
| **Type** | Skill (on-demand workflow) |
| **Category** | `audit` |
| **Artifact** | [`SKILL.md`](SKILL.md) |
| **Tooling** | [`scripts/sweep.ts`](scripts/sweep.ts) (read-only heuristic scan) |

## What it is

`detection-sweep` is a whole-codebase health check. It runs every available check block (typecheck, lint, tests, security audit), and for each failure it files a **ticket in the tracker** — nothing more. Its two outputs are tickets and a report. It never edits code and never commits.

## Why it exists

The failure mode of an audit is the audit that starts fixing things. Once a sweep begins editing, its report stops being trustworthy (was that failure real, or did you already fix it?), and the fixes ship unreviewed and untracked. So the skill draws a hard line: **detect only**. The value is a complete, verifiable map of the project's problems, each one durable as a ticket with a reproduction command — not a pile of half-fixes and "recommendations" that evaporate.

## When it triggers

Invoke it when asked to:

- "check the whole project", "detect the problems", "run a sweep"
- do a periodic health check of a codebase
- run a pre-release audit

Use `writing-robust-tests` instead to cover one targeted file, and `bug-ticket-root-cause` instead to document a single observed bug in depth.

## How it works

The sweep detects the project's available check blocks (typecheck, lint, tests, security audit), runs them all fastest-to-slowest even past failures, and turns each distinct failure cause into one tracker ticket carrying its reproduction command, output, files, and labels. Anti-duplicate signatures and a per-pass creation cap keep the ticket stream sane, and a final `block | status | tickets` report — with skipped blocks called out — closes the pass. No code is edited, nothing is committed.

Full step-by-step protocol → [`SKILL.md`](SKILL.md).

### The helper script

[`scripts/sweep.ts`](scripts/sweep.ts) is a read-only, dependency-free heuristic scan (`npx tsx scripts/sweep.ts [path]`). It walks the source tree and counts broad signals: flagged debt (TODO/FIXME, lint suppressions), debug leftovers, fragile or disabled tests, swallowed errors, potential secret patterns, and oversized files. It writes nothing — it just prints counts for the skill to triage into tickets (one per cause).

### Red flags that mean STOP

An Edit/Write on a code file, a `git commit`, or a "recommendation" with no ticket number against it — any of these means the sweep has drifted out of detection.

## Worked example

> A pre-release sweep of `acme-app`.

1. Detect blocks from `package.json`: `typecheck`, `lint`, `test`, `test:e2e`, plus `npm audit`. Run all, in that order.
2. `lint` is clean; `typecheck` throws 9 errors all from one renamed type (→ **1 ticket**); `test` has 2 unrelated failures (→ **2 tickets**); `npm audit` reports a high-severity CVE (→ **1 ticket** with the proposed `npm audit fix` command *inside* the ticket, not run).
3. Before creating, search `sweep`-labelled tickets: the CVE already has an open ticket → comment on it instead of a fifth ticket.
4. Report: a table of the five blocks with status and the three new ticket numbers, total 3 created / 1 commented, and the run duration.

Throughout: no file edited, no commit.

## Related artifacts

- [`writing-robust-tests`](../writing-robust-tests/) — to cover a single targeted file rather than audit the whole.
- [`bug-ticket-root-cause`](../bug-ticket-root-cause/) — to document one observed bug in depth.

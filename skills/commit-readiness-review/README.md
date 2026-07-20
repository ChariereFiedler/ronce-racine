# `commit-readiness-review`

> A pre-commit self-review that scans for secrets, runs the right per-stack checks, catches debug leftovers, and stages file by file - before the commit, never after.

| | |
|---|---|
| **Type** | Skill (on-demand workflow) |
| **Category** | `process` |
| **Artifact** | [`SKILL.md`](SKILL.md) |
| **Tooling** | [`scripts/precommit-scan.ts`](scripts/precommit-scan.ts) (read-only staged-diff scanner) |

## What it is

`commit-readiness-review` is the gate an agent runs on itself right before any Claude-initiated `git commit`. It turns "commit that" into a short, ordered checklist: map the diff, scan for secrets, run format/lint/typecheck/targeted tests per touched stack, catch forbidden patterns, stage each file deliberately, then summarize and ask for confirmation.

It is generic on purpose. If the current repo has its own pre-commit skill with exact commands, that one wins - this is the baseline when none exists.

## Why it exists

A commit is cheap to make and expensive to unmake. Two costs dominate:

- **A leaked secret.** Once a key, token or private key is pushed, the fix is not a `revert` - it is a **credential rotation plus a history purge**. The skill treats any secret detection as a hard STOP, no matter the time pressure, because "just for debugging" still leaks.
- **A broken or dirty commit.** Skipping the lint "because we're in a hurry" ships red pipelines, debug `console.log`s, hardcoded waits, and disabled tests. The skill's stance is that **time pressure does not change the checklist** - and that a green check means *executed with pasted output*, never assumed.

Staging file by file (never blind `git add -A`) is part of the same defense: it keeps `.env`, build artifacts, and unrelated changes out of the commit.

## When it triggers

- Any agent-initiated commit is imminent - "ready to commit", "commit that", "quick commit"
- Time pressure to ship
- A diff containing test/debug leftovers, or touching multiple stacks

Route elsewhere when: the question is "does it actually work" (functional proof) rather than "is it committable" (→ [`validating-features-end-to-end`](../validating-features-end-to-end/)); or the repo has its own git skill whose branch/message/tracker conventions take precedence.

## How it works

The skill turns "commit that" into an ordered gate the agent runs on itself before any commit: map the diff and STOP on at-risk files, scan for secrets (gitleaks or a regex fallback), run format → lint → typecheck → targeted tests per touched stack, catch forbidden patterns (debug leftovers, hardcoded waits, disabled tests), stage each file deliberately rather than `git add -A`, then summarize and ask for confirmation. Any secret detection is a hard STOP, and time pressure never shortens the checklist - a green check means executed with pasted output, never assumed.

Full step-by-step protocol (exact commands, grep patterns, traps) → [`SKILL.md`](SKILL.md).

### The scanner

[`scripts/precommit-scan.ts`](scripts/precommit-scan.ts) automates steps 2 and 4:

```bash
npx tsx scripts/precommit-scan.ts        # scans git diff --cached
npx tsx scripts/precommit-scan.ts --all  # also scans the unstaged tree
```

It uses gitleaks when installed and falls back to a regex otherwise, flags staged sensitive files, and reports debug leftovers. It is read-only and exits 1 on a secret or sensitive file (debug hits are non-blocking, left to human judgment). It can be wired as a hook - see [`hooks/`](../../hooks/).

## Worked example

> You ask the agent to commit a change to `acme-app` that touches a TypeScript service and a SQL migration.

1. `git diff --stat` shows two stacks; no `.env` in scope.
2. `precommit-scan.ts` is clean on secrets but flags a leftover `console.log` in the service.
3. The agent removes the log, then runs the TS format/lint/typecheck and the targeted service test - all green, output pasted.
4. Files are staged one by one; the migration and the service file both belong to the change.
5. The agent proposes `fix(billing): correct proration rounding` and asks for confirmation before committing.

## Related artifacts

- [`validating-features-end-to-end`](../validating-features-end-to-end/) - for "does it work", the functional proof this skill does not provide.
- [`ci-pipeline-orchestration`](../ci-pipeline-orchestration/) - takes over once the commit is pushed and the pipeline runs.
- Rule [`pre-commit-secret-detection`](../../rules/pre-commit-secret-detection.md) - the always-on policy behind the secret-scan step.

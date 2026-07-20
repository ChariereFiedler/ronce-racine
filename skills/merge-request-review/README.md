# `merge-request-review`

> Reviewing a change before integration means reading the diff line by line and issuing an explicit verdict — a green pipeline is not an approval.

| | |
|---|---|
| **Type** | Skill (on-demand workflow) |
| **Category** | `process` |
| **Artifact** | [`SKILL.md`](SKILL.md) |
| **Tooling** | [`templates/mr-review-report.md`](templates/mr-review-report.md) |

## What it is

`merge-request-review` is the discipline for reviewing **someone else's, or not-yet-integrated, work** before it lands on the mainline. It reframes review from a rubber stamp into an obligation: approving means you have read the full diff, worked through a fixed checklist, and issued an explicit verdict — approve or request changes, never a vague "looks good".

It is forge- and tracker-agnostic. When the current repo has its own review skill that knows the platform and its API, that one wins.

## Why it exists

A green pipeline proves the **existing** tests pass. It says nothing about whether the new code is correct, safe, or in scope. The costly leaks slip through exactly where CI is silent:

- a secret or a `*.pem`/`.env` committed in a single line
- a breaking change to a public signature/prop/event that no test in this repo exercises
- debug leftovers (`console.log`, `dbg!`, `debugger`, unjustified `unwrap`) shipped to prod
- hard-coded waits (`sleep`, `waitForTimeout`) that make the suite flaky
- disabled tests (`.skip`, `xit`, `#[ignore]`) quietly hiding a failure

Each of these fits in one line, which is why "small diff, no need to read" and "it's urgent, I merge" are the rationalizations the skill explicitly rejects.

## When it triggers

Invoke it when reviewing a merge/pull request or a branch diff before merge:

- "review this MR" / "review this PR" / "validate this branch diff"
- before integrating someone else's work into the mainline

Use a sibling instead when the work is **your own**: [`commit-readiness-review`](../commit-readiness-review/) before committing your changes, the Superpowers `requesting-code-review` skill to get your finished work reviewed, or [`validating-features-end-to-end`](../validating-features-end-to-end/) when the question is "does it work" rather than "is it mergeable".

## How it works

Gather the real inputs — the full diff (`git diff <remote>/<target>...<remote>/<source>`, not the forge summary), the CI status job by job, the linked ticket, the repo conventions — then read the whole diff before working a fixed checklist that hunts for the leaks CI stays silent on: debug leftovers, hard-coded waits, breaking contract changes, sensitive files, disabled tests, out-of-scope changes. The review closes on an explicit verdict, and no blocking point may remain when approving.

Full step-by-step protocol → [`SKILL.md`](SKILL.md).

### Record the verdict

[`templates/mr-review-report.md`](templates/mr-review-report.md) captures the verdict (APPROVE / REQUEST CHANGES), blocking points (`file:line — problem — expected fix`), minor non-blocking points, and the checklist. As long as a blocking point remains, do not approve.

## Worked example

> "OK to merge this PR?" — a branch adding a CSV export endpoint.

1. Fetch and diff the branch against `main`. CI is green.
2. Reading the diff line by line: an added `console.log(user.email)` (debug leftover **and** a sensitive-data log), and a renamed response field `created` → `createdAt` that a mobile client consumes (unflagged breaking change).
3. Verdict: **REQUEST CHANGES**. Blocking: remove the log; either keep the field name or flag and coordinate the breaking change. The green pipeline never surfaced either.

## Related artifacts

- [`commit-readiness-review`](../commit-readiness-review/) — for reviewing your own changes before commit.
- [`validating-features-end-to-end`](../validating-features-end-to-end/) — for "does it actually work", functional proof.

---
name: merge-request-review
description: Use when reviewing a merge/pull request or a branch diff before merge - "review this MR", "review this PR", "validate this branch diff", "review cette MR", "review cette PR", "valide ce diff de branche", before integrating someone else's work into the mainline.
version: 1.0.0
metadata:
  last-reviewed: 2026-06-19
  category: process
---

# Merge Request Review - reviewing a change before integration

> If the current repo has a specific review skill (e.g. acme-app → `mr-review`), it wins - it knows the forge, the tracker, the API commands and the project's optional auto-merge.

## This skill vs. others

- **This skill** when: reviewing the diff of an MR/PR or a branch **that is someone else's or not yet integrated** before merge - "review this PR", "validate this diff", "OK to merge?"
- **`commit-readiness-review`** instead if: it is **my own** changes to commit (before commit, not before merging a third-party branch)
- **`superpowers:requesting-code-review`** instead if: I want **my own** finished work reviewed, not to review someone else's
- **`validating-features-end-to-end`** instead if: the question is "does it work" (functional proof), not "is it mergeable"

## Principle

- **Approving = having read the diff line by line.** A "green pipeline" proves the existing tests pass, not that the code is correct, safe or complete.
- The review produces an **explicit verdict**: approve / request changes - never a vague "looks good".

## Context to gather (before acting)

- **The full diff** of the source branch against the target: `git fetch <remote> <source-branch>` then `git diff <remote>/<target>...<remote>/<source-branch>` (not just the forge summary)
- **The pipeline / CI status** of the MR/PR (green / red / running) via the forge UI or CLI
- **The linked ticket / issue**: what the change is supposed to do → check the diff does it, and only that
- **The repo conventions**: message format, lint/typecheck/test per stack (`package.json` / `Cargo.toml` / `Makefile` / CI config)

## Protocol

Read the whole diff first, then work through the checklist:

```
- [ ] Pipeline / CI green (and looked at: which jobs, not just the overall badge)
- [ ] Debug leftovers in added lines (console.log, print, dbg!, debugger, unjustified unwrap/expect)
- [ ] Hard-coded waits (waitForTimeout, sleep) in tests
- [ ] Contract / API respected: public signatures, props, events, schema - no unflagged breaking change
- [ ] i18n: no visible hard-coded string if the project is internationalized
- [ ] Sensitive files: .env, *.pem, *.key, credentials, secrets → STOP
- [ ] Disabled tests (.skip, xit, #[ignore]) without justification
- [ ] No conflict with the target (otherwise → resolve before merge)
- [ ] The diff does what the ticket says, and nothing out of scope
- [ ] Explicit verdict issued: approve OR request changes
```

If there is a conflict with the target: rebase/merge the target into the source, re-validate lint/test, re-push - never force-push the default branch. Schema migration already applied → do not modify the old one, create a new one.

## Templates

- `templates/mr-review-report.md` - review report (verdict, blocking points, minor points)

## Traps & rationalizations

| Excuse | Reality |
|--------|---------|
| "Pipeline green, I approve" | The pipeline tests the existing code, not the correctness or safety of the new code. Read the diff |
| "Small diff, no need to read" | A secret or a breaking change fits in one line |
| "It's urgent, I merge" | Urgency does not change the checklist; a broken merge costs more than a review |
| "The contract doesn't look touched" | Check the public signatures/props/events called elsewhere, don't assume |
| "Minor conflict, I force-push" | Always `--force-with-lease`, never on the default branch |

## Exit condition

- [ ] Full diff read (not just the forge summary)
- [ ] Whole checklist worked through; every gap → blocking or justified
- [ ] Verdict issued: approve or request changes, with reasons
- [ ] If merged: green pipeline confirmed and no sensitive files

As long as a blocking point remains, do not approve.

## Changelog

- 1.0.0 (2026-06-19) - initial version, derived from an MR review workflow; forge/tracker/auto-merge coupling removed

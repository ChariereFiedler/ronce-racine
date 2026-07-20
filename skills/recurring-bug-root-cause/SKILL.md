---
name: recurring-bug-root-cause
description: Use when fixing a bug in a scope that already received 2+ similar fixes recently, when a second bug of the same class appears elsewhere, or when noticing "this bug again" / "encore ce bug" / repeated fix commits on the same area. Use BEFORE writing the Nth one-line fix.
version: 1.0.1
metadata:
  last-reviewed: 2026-07-20
  category: bug
---

# Root-causing a recurring bug

> If the current repo has a dedicated anti-recurrence skill or process (e.g. acme-app → `recidive-root-cause` + `retro-fixes.ts`), it wins.

## This skill vs. others

- **This skill** when: 2+ similar recent fixes on the same scope, or a 2nd bug of the same class elsewhere, or "this bug again"
- **`bug-ticket-root-cause`** if: first observed bug, an isolated case to document (not yet a class)
- **`superpowers:systematic-debugging`** if: a single bug to diagnose, with no repetition pattern

## Principle

3+ fixes on the same scope in ~2 weeks = trial-and-error debugging: you are patching **symptoms** of one shared cause. **A bug class is hunted with tooling, not with a reminder** - a documentation rule does not protect the existing code and does not survive inattention.

## The trap (observed in baseline)

Under pressure, the reflex is: ship the one-line fix, promise yourself "I'll create the root-cause ticket later"… and never do it. **The urgent fix may ship first, but the session does not end until the spike leaves a trace** (ticket created, or spike done immediately). "I'll keep it in mind" does not count.

## Tooling

- Test procedure: `scripts/detect-recurring-fixes.test.ts` - deterministic behavioral test of the script (positive + negative fixture). Run `npx tsx scripts/detect-recurring-fixes.test.ts` from the canonical repo after any change to the script (also picked up by `npm test`). Not distributed to target repos.

- `scripts/detect-recurring-fixes.ts [--window 14] [--threshold 3] [repoDir]` - detects scopes at the threshold from the git log (conventional commits); exit 1 on recurrence → usable as a CI check
- `templates/postmortem-recidive.md` - short postmortem template with a hypothesis table

## Context to gather (before acting)

- The list of the N fixes on the scope: `scripts/detect-recurring-fixes.ts` then `git log`/`git blame` on the files involved
- Guard tooling already in place (custom lint, hooks, CI checks) and why it did not catch the class
- The project's lint/test/build commands (`package.json` / `Cargo.toml` / CI config) - that is where the blocking guardrail lives
- The repo tracker for one ticket per action not shipped within the fix

## Steps

### 1. Map the class, not the symptom
- Detection: `scripts/detect-recurring-fixes.ts`, then list the N fixes on the scope
- Key question: **what common property links these fixes?** (same implicit contract violated, same missing guardrail, same environment divergence)

### 2. Spike hypotheses - each confirmed or refuted
- 2–4 root-cause hypotheses, each tested against the facts with evidence
- Always include: "existing tooling should have caught it - why didn't it?" and "this is an isolated slip of attention" (usually refuted by the 2nd occurrence)
- A postmortem with no refuted hypothesis = narrative, not a spike

### 3. TOOLED guardrail (not documentation)
- Choose the most mechanical **blocking** mechanism: compiler option, custom lint rule, integration test on the class, pre-commit hook, CI check
- The guardrail must **sweep the existing code** (each error raised = a latent bug or an annotated exception) - a rule that only applies to future code leaves the bombs in place
- Never a non-deterministic guardrail (worse than nothing)

### 4. Class regression tests
- One test per fixed occurrence **and** a test/check covering the whole class

### 5. Trace
- Short postmortem (timeline, root cause, tested hypotheses, actions) with a real ticket per action not shipped within the fix

## Traps & rationalizations

| Excuse | Reality |
|--------|---------|
| "I ship the fix and create the root-cause ticket later" | "Later" never comes. The session does not end without the spike's trace (ticket created or spike done). |
| "It's just an isolated slip" | A hypothesis to refute, not to assume - usually false by the 2nd occurrence. |
| "I'll add a note/rule to CLAUDE.md, that's enough" | A documentation rule does not sweep the existing code and does not survive inattention. Blocking guardrail or nothing. |
| "The guardrail only applies to new code" | The bombs stay in place. It must sweep the existing code: each error raised = a latent bug or an annotated exception. |
| "I'll keep it in mind" | Memory ≠ trace. Postmortem or a real ticket. |

## Guardrails

- **Never** fix the Nth symptom and declare the recurrence handled
- **Never** end the session without a trace of the spike (ticket or postmortem)
- **Never** mix the urgent fix and the root-cause refactor in the same commit

## Exit condition

- [ ] Class named (property common to the N fixes), not just the Nth symptom
- [ ] 2–4 hypotheses spiked, at least one refuted with evidence
- [ ] "Existing tooling should have caught it - why didn't it?" answered
- [ ] **Blocking, deterministic** guardrail added, sweeping the existing code (check output pasted)
- [ ] One test per fixed occurrence + a test/check covering the class
- [ ] Trace delivered: postmortem + a real ticket per deferred action

## Changelog

- 1.0.1 (2026-07-20) - co-located test procedure for detect-recurring-fixes.ts (scripts/detect-recurring-fixes.test.ts)

- 1.0.0 (2026-06-19) - initial versioned release + state-of-the-art enrichment (routing, context, protocol, traps, exit condition)

---
name: bug-triage-structured
description: Use when a bug needs full triage before deciding what to do with it - "reproduce and analyze this bug", "reproduis et analyse ce bug", "fix now or open a ticket?", "faut-il corriger maintenant ou ouvrir un ticket", "triage this bug", "trie ce bug", a fresh bug report where reproduction and root cause are still unknown. NOT for merely documenting an already-understood bug.
version: 1.1.0
metadata:
  last-reviewed: 2026-07-21
  category: bug
---

# Structured bug triage - reproduce, understand, decide

> If the current repo has a specific triage/ticketing skill (e.g. acme-app → `add-bug`, beta-app → `jira-bug`), it wins - it knows the project's tracker, paths and commands.

## This skill vs. others

- **This skill** when: a bug arrives with no confirmed repro or known cause, and the "fix now / ticket" decision is not yet made. Covers the full cycle: repro → root-cause → decision → confirmation test.
- **`bug-ticket-root-cause`** if: the decision is already "we're not fixing now, we document". No reproduction/decision phase - just write the ticket.
- **`recurring-bug-root-cause`** if: the scope has already had **2+ similar recent fixes** → it is a class, not an isolated case; that skill requires a tooled guardrail.
- **`superpowers:systematic-debugging`** if: the repro and cause are already established and you are fixing.

## Principle

Triage decides **before** acting: you neither fix nor open a ticket until the bug is reproduced and the cause is located. The "fix now vs ticket" decision is made on facts (mechanism + `file:line`), not on a sense of urgency. In every case the output includes a **confirmation test** that fails before and passes after - otherwise nothing proves it is resolved.

## Context to gather (before acting)

- Project test/lint/build commands (`package.json` / `Cargo.toml` / `Makefile` / CI config) - to reproduce and to target the confirmation test
- Tracker + repo label/format conventions (project skill if one exists) - do not invent an identifier format
- Access to production code? If not, mark the cause `to investigate` without disguising it
- Bug already open? search for a duplicate in existing tickets before creating one

## Protocol

```
- [ ] 1. Reproduce - minimal, deterministic repro (or assumed intermittent status)
- [ ] 2. Root-cause - mechanism + file:line + introducing commit + hypothesis status
- [ ] 3. Decide - fix now OR ticket, on explicit criteria
- [ ] 4. Confirmation test - red before, green after
```

### 1. Reproduce
Establish a minimal, deterministic reproduction: initial state, action, observed vs expected symptom, where (page/endpoint/module), since when (commit/version). If not reproducible after reasonable effort: declare it `intermittent`, note the suspected conditions, and do not invent a cause. If too vague to locate the code: ask 2-3 targeted questions and **stop**.

### 2. Root-cause (if code access)
- Read the real production code, trace the flow end to end (UI → state → call → handler → data)
- Git archaeology: `git log`/`git blame` on the suspect files → introducing commit
- Confront the facts: an existing test that should have failed (why didn't it?), a query, a log
- Deliverable: **mechanism** (≠ symptom) + **cited code `file:line`** + introducing commit + status (`confirmed` / `strong` / `to validate` / `to investigate`)

### 3. Decide - fix now OR ticket
Rule on criteria, not on feeling:

| Decision | When |
|----------|------|
| **Fix now** | cause `confirmed`, localized and low-risk fix, within the current session's scope |
| **Ticket** | cause `strong`/`to validate`/`to investigate`, or a large/risky fix, or out of scope/priority, or not the right time |

When in doubt → ticket. A fix whose cause is not confirmed is a fix by trial and error.

### 4. Confirmation test
In **both** branches, write/identify the test that materializes the bug: it must **fail before** the fix and **pass after**.
- Fix branch: add the test, see it red, fix, see it green (paste both outputs).
- Ticket branch: fill the ticket's confirmation-tests table (Type · target file · assertion · ❌ before / ✅ after) without coding the fix.

### 5. Check for recurrence (run it, do not eyeball it)
Never skip this step: a bug that already came back is a different problem from a first-time bug, and the triage decision changes.

```bash
git log --oneline -20 --grep="fix(<scope>)"    # <scope> = the area you just triaged
```

If the scope has already had 2+ recent fixes → apply `recurring-bug-root-cause` (tooled guardrail) instead of laying down the Nth one-line fix. State the count in the triage sheet even when it is zero, so the check is visibly done.

## Templates

- `templates/bug-triage.md` - triage sheet: reproduction, root cause, argued decision, confirmation test (also serves as the ticket body if the decision = ticket, tracker-agnostic)

## Traps & rationalizations

| Excuse | Reality |
|--------|---------|
| "It's obvious, I'll just fix it" | Without a repro + `file:line`, "obvious" = a hypothesis. Reproduce and locate first. |
| "I'll decide after coding the fix" | The fix/ticket decision is made on the confirmed cause, not after committing to the code. |
| "The confirmation test, I'll do it later" | Without a red-then-green test, nothing proves it's fixed. It is the heart of triage, not an option. |
| "Cause not sure but I'll try the fix" | Unconfirmed cause → ticket. A fix on an uncertain cause is trial and error. |
| "Symptom = cause" | The symptom is observed, the cause is the mechanism. Trace to the point of divergence. |

## Exit condition

- [ ] Deterministic reproduction established (or `intermittent` status assumed with conditions noted)
- [ ] Root cause = mechanism + `file:line` (or `to investigate` for lack of code access)
- [ ] Fix/ticket decision made on explicit criteria
- [ ] Confirmation test red-before / green-after (outputs pasted if fix; table filled if ticket)
- [ ] Recurrence checked - `recurring-bug-root-cause` applied if 2+ recent fixes on the scope

## Tooling

- `templates/bug-triage.md` - triage sheet / tracker-agnostic ticket body

## Changelog

- 1.1.0 (2026-07-21) - recurrence check made mechanical (git log command, count stated even when zero); eval runs showed agents skipping it

- 1.0.0 (2026-06-19) - initial release: project-agnostic generalization of the add-bug workflow into full triage (repro → root-cause → decision → confirmation)

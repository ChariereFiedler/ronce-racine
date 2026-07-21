---
name: bug-ticket-root-cause
description: Use when reporting or documenting an observed bug as a ticket (any tracker - GitLab, Jira, GitHub) - "report a bug", "signale un bug", "create a bug ticket", "crée un ticket de bug", "it doesn't work", "ça ne marche pas", a regression to document without fixing it now.
version: 1.0.0
metadata:
  last-reviewed: 2026-06-19
  category: bug
---

# Bug ticket with root cause

> If the current repo has a specific ticketing skill (e.g. acme-app → `add-bug`, beta-app → `jira-bug`), it wins - this skill defines the **content**, the project skill defines the **format/tracker**.

## This skill vs. others

- **This skill** when: documenting an observed bug as a ticket, without fixing it now
- **`recurring-bug-root-cause`** if: the scope has already had 2+ similar recent fixes → it is a class, not an isolated case
- **`superpowers:systematic-debugging`** if: the goal is to fix now, not to trace
- **`qa-session-intake`** if: the source is a recorded QA session (several problems to triage)

## Principle

- A ticket with no cited root cause is an invitation to fix by trial and error
- A ticket with no confirmation tests is incomplete
- **This workflow produces a ticket, not a fix** - fix nothing, modify no application file

## Tooling

- `templates/bug-ticket.md` - full ticket skeleton (context, root cause, scenarios, confirmation-tests table, priority)

## Context to gather (before acting)

- Tracker + repo format/label conventions (project bug skill if one exists) - do not invent a format
- Project test commands (`package.json` / `Cargo.toml` / CI config) to fill the confirmation-tests table with real targets
- Access to production code? If not, mark the cause `to investigate` without disguising it
- Bug already open? search existing tickets before creating a duplicate

## Workflow

### 1. Frame the symptom
What (observed vs expected) · Where (page/endpoint/module) · Since when (commit, version) · Reproducibility. If too vague to locate the code: ask 2-3 questions and **stop**.

### 2. Root-cause investigation (if code access)
- Read the real production code, trace the flow end to end (UI → state → call → handler → data)
- Git archaeology: `git log`/`git blame` on the suspect files → introducing commit
- Confront the facts where possible (an existing test that should have failed - why didn't it?, a query, a log)
- Deliverable: **mechanism** (≠ symptom) + **cited code `file:line`** + introducing commit + hypothesis status (`confirmed` / `strong` / `to validate`)
- Without code access: say so explicitly and mark the cause `to investigate` - do not disguise a design hypothesis as a root cause

### 3. Ticket content
- **Context**: symptom, expected behavior, user impact
- **Root-cause analysis** (section above)
- **Reproduction scenarios**: (1) reproduce the bug - fails today, (2) nominal behavior post-fix, (3) related edge case
- **Required confirmation tests**: table Type (UT/E2E/API) · target file · key assertion · ❌ before fix / ✅ after. Each test MUST fail before the fix and pass after
- **Argued priority** (prod down/data loss → critical ; broken with no workaround → high ; workaround possible → medium ; cosmetic → low)

### 4. Check for recurrence
If the scope has already had 2+ recent fixes → a "Recurrence" section in the ticket and apply `recurring-bug-root-cause`.

## Traps & rationalizations

| Excuse | Reality |
|--------|---------|
| "The cause is obvious, no need to cite the code" | "Obvious" with no `file:line` = a design hypothesis. Cite it or mark it `to investigate`. |
| "I'll note the tests table later, the ticket is urgent" | A ticket with no confirmation tests is unclosable and goes back to trial and error. It is the heart of the ticket. |
| "While I'm here, I'll fix the bug" | This workflow produces a ticket, not a fix. The fix mixes in with the analysis and blurs the trace. |
| "Symptom = cause" | The symptom is what you see, the cause is the mechanism. Trace the flow to the point of divergence. |

## Guardrails

- **Never** assert a root cause without citing code
- **Never** create the ticket without the confirmation-tests section
- **Never** fix the bug in this workflow

## Exit condition

- [ ] Root cause = mechanism + cited `file:line` (or explicitly `to investigate` for lack of code access)
- [ ] Confirmation-tests table filled - each test fails before the fix, passes after
- [ ] 3 scenarios present (repro, nominal post-fix, related edge case)
- [ ] Argued priority
- [ ] No application file modified
- [ ] Recurrence checked (section added + `recurring-bug-root-cause` if 2+ recent fixes)

## Changelog

- 1.0.0 (2026-06-19) - initial versioned release + state-of-the-art enrichment (routing, context, protocol, traps, exit condition)

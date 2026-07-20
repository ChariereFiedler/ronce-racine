---
name: recording-decisions
description: Use when a non-trivial technical choice is made during a session - "let's go with X", "on choisit X", "we'll pick", "on part sur", "decision made", "décision prise", a counter-intuitive approach adopted, an external constraint accepted, a workaround whose reason will be forgotten.
version: 1.0.0
metadata:
  last-reviewed: 2026-06-19
  category: process
---

# Recording Decisions - capture non-obvious choices

> If the current repo has an equivalent skill (e.g. acme-app → `record-decision`), it wins - it knows where the decision log lives.

## This skill vs. others

- **This skill** when: a non-trivial technical choice is made mid-session and risks being undone out of ignorance
- **`bug-ticket-root-cause`** if: you are tracing a bug to fix, not a design decision
- **`writing-plans`** if: you are designing a full plan up front - the decision gets recorded at the moment it is made, it is not replaced by the plan

## When to record

Threshold: **"would a developer (or agent) picking this up in three weeks need to know this to avoid undoing it?"** If yes → record.

- A choice between 2+ approaches (polling vs. websocket, lib A vs. B)
- A counter-intuitive pattern or workaround whose reason evaporates
- An accepted external constraint (infra, library, third-party API)
- A change of course versus the ticket/spec

Do not record: variable names, import order, trivial choices.

## Double anchoring (both, not either)

Two distinct regression vectors → two protections:

1. **Decision log** - against deliberate migration ("nobody knows why it's like this, let's change it"). Location: `docs/adr/` if the repo has one, otherwise `.claude/decisions.md`. Format:

```markdown
## YYYY-MM-DD - <Short title>
**Context**: [problem that forced the decision, ticket/branch]
**Options**: 1. A - pro/con · 2. B - pro/con
**Decision**: [choice + rationale]
**Consequences**: [code impact, workflow, re-evaluate if <condition>]
**Status**: Proposed | Accepted | Implemented | Deprecated
```

2. **Comment at the implementation site** - against the impulsive "fix" during a refactor. Short, with a strong signal and a back-reference:

```
// Intentional 5s polling - DO NOT migrate to WebSocket:
// the LB drops idle connections >60s. See ADR-007.
```

## Rules

- Record **at the moment of the decision**, not at the end of the session (context evaporates)
- Never modify an existing decision - write a new one that deprecates it
- Include the re-evaluation condition ("if the infra changes…"): a decision with no expiry date becomes dogma
- Not in a closed ticket, a chat message or a PR description alone - invisible from the code in three weeks

## Traps & rationalizations

| Excuse | Reality |
|--------|---------|
| "I'll record it at the end of the session" | The context (rejected options, exact constraint) evaporates. Record at the moment of choice. |
| "It's obvious why we do it this way" | Obvious today, a mystery in three weeks. The test: "would someone picking it up guess it without risk of undoing it?" |
| "The log is enough, no need for a comment" | The log protects against deliberate migration; the comment protects against the impulsive "fix" in a refactor. Both. |
| "I said it in the PR / chat" | Invisible from the code. Log + comment at the implementation site. |
| "I'm fixing the old decision that was wrong" | Never rewrite: write a new one that deprecates the old (the history of the reasoning matters). |

## Exit condition

- [ ] Decision recorded at the moment it was made
- [ ] Log entry in the right place (`docs/adr/` otherwise `.claude/decisions.md`): context, options, decision, consequences, status
- [ ] Comment at the implementation site with a strong signal + back-reference (if impulsive regression is plausible)
- [ ] Explicit re-evaluation condition ("revisit if …")

## Tooling

- No script: essentially a human decision. Inline templates above (log entry + comment).
- If the repo has a `docs/adr/` directory, follow its existing numbering and template rather than these.

## Changelog

- 1.0.0 (2026-06-19) - initial versioned release + state-of-the-art enrichment (routing, context, protocol, traps, exit condition)

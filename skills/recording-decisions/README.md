# `recording-decisions`

> Capture non-obvious technical choices the moment they are made, so no one silently undoes them three weeks later.

| | |
|---|---|
| **Type** | Skill (on-demand workflow) |
| **Category** | `process` |
| **Artifact** | [`SKILL.md`](SKILL.md) |
| **Tooling** | None (human-driven; inline templates) |

## What it is

`recording-decisions` is a discipline for **institutional memory**. Every codebase accumulates choices whose reasons are obvious in the moment and invisible afterward: why polling instead of a websocket, why this library over that one, why a seemingly redundant guard exists. When the reason is lost, the choice looks like an accident — and the next person "cleans it up," reintroducing the exact problem it solved.

This skill turns that tacit reasoning into two durable, co-located records.

## Why it exists

Undocumented decisions regress along **two independent paths**, and each needs its own defense:

1. **Deliberate migration** — someone reviews the code, sees no rationale, concludes "nobody knows why this is here," and rewrites it. Defense: a **decision log** entry that survives at the repo level.
2. **Impulsive refactor** — someone is mid-refactor, the odd-looking line catches their eye, and they "fix" it reflexively. A repo-level log won't stop them; they're not reading it. Defense: a **comment at the implementation site** with a loud signal.

A single record covers only one path. That is why the skill insists on **both** — decision log *and* inline comment — whenever an impulsive regression is plausible.

## When it triggers

Invoke it when a non-trivial technical choice is made during a session and phrases like these appear:

- "let's go with X" / "we'll pick" / "decision made"
- a counter-intuitive approach is adopted
- an external constraint is accepted (infra, library, third-party API)
- a workaround is introduced whose reason will be forgotten

The threshold test: *"would a developer or agent picking this up in three weeks need to know this to avoid undoing it?"* If yes, record it.

**Do not** invoke it for trivia — variable names, import order, obvious choices. Over-recording drowns the signal.

## How it works

The skill anchors a decision in two co-located places — a repo-level log entry and a loud comment at the implementation site — because deliberate migration and impulsive refactor are independent regression paths that each need their own defense. The templates and rules below are the mechanism; the full protocol → [`SKILL.md`](SKILL.md).

### 1. The decision log entry

Location: `docs/adr/` if the repo uses Architecture Decision Records, otherwise `.claude/decisions.md`.

```markdown
## YYYY-MM-DD — <Short title>
**Context**: [problem that forced the decision, ticket/branch]
**Options**: 1. A — pro/con · 2. B — pro/con
**Decision**: [choice + rationale]
**Consequences**: [code impact, workflow, re-evaluate if <condition>]
**Status**: Proposed | Accepted | Implemented | Deprecated
```

### 2. The implementation-site comment

Short, with a strong signal and a back-reference to the log:

```
// Intentional 5s polling — DO NOT migrate to WebSocket:
// the LB drops idle connections >60s. See ADR-007.
```

### Non-negotiable rules

- Record **at the moment of the decision**, not at the end of the session — the rejected options and the exact constraint evaporate fast.
- **Never rewrite** an existing decision. Write a new one that deprecates it; the history of the reasoning is part of the value.
- Always include a **re-evaluation condition** ("revisit if the infra changes"). A decision with no expiry becomes dogma.
- A closed ticket, a chat message, or a PR description **alone** do not count — they are invisible from the code.

## Worked example

> During a session you choose 5-second polling over a websocket because the load balancer kills idle connections after 60 seconds.

1. Append to `.claude/decisions.md`:
   ```markdown
   ## 2026-07-10 — Poll every 5s instead of a websocket
   **Context**: live status widget; LB drops idle connections >60s.
   **Options**: 1. WebSocket — real-time, but killed by the LB · 2. 5s polling — slightly stale, survives the LB.
   **Decision**: 5s polling. Simpler, resilient to the LB, staleness acceptable for this widget.
   **Consequences**: extra request every 5s (negligible). Re-evaluate if the LB idle timeout is lifted.
   **Status**: Accepted
   ```
2. Add the guard comment at the polling call site, referencing the entry.

## Related artifacts

- [`bug-ticket-root-cause`](../bug-ticket-root-cause/) — for tracing a bug to fix, not a design decision.
- the Superpowers `writing-plans` skill — plans are designed up front; decisions are recorded when made.

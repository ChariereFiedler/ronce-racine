# `qa-session-intake`

> Turn a recorded human QA session — timeline, screenshots, network errors — into a clean set of tracker tickets, one per distinct problem, with nothing lost silently.

| | |
|---|---|
| **Type** | Skill (on-demand workflow) |
| **Category** | `process` |
| **Artifact** | [`SKILL.md`](SKILL.md) |
| **Tooling** | None generic (project intake tool if present) |

## What it is

`qa-session-intake` is a triage discipline. A manual QA pass produces a noisy bundle: a timestamped timeline of verbal remarks, a pile of screenshots, and a log of network errors captured by the browser. Left raw, it is unusable — too much to act on, too easy to lose. This skill converts that bundle into a small, actionable set of tickets plus an auditable trace of what happened to every signal.

## Why it exists

The two failure modes of manual triage are opposite and equally bad:

- **One ticket per event** — 45 network errors become 45 tickets. The signal drowns in noise; nobody triages 45 items.
- **One mega-ticket** — the whole session dumped into a single issue. Untriageable, unclosable, forgotten.

Both destroy the value of the session. The fix is a firm rule — **one ticket per distinct problem** — plus correlation done *before* any ticket is created, so a 40-minute session collapses to the 5–10 real problems it actually surfaced.

It also defends against a subtler loss: a network error the tester never noticed. A silently failing endpoint can hide data loss, so "the tester said nothing" is not a reason to drop it.

## When it triggers

Invoke it when you have a recorded QA session bundle to process into tickets:

- "process the QA session" / "create the QA tickets"
- a QA bundle folder (timeline + screenshots + network log) to triage

Use a sibling skill instead when: a single observed bug outside a session (`bug-ticket-root-cause`), or proving a specific feature works (`validating-features-end-to-end`).

## How it works

The skill correlates before it creates: the timeline is read chronologically, network errors are clustered by `(endpoint, status, message)` and attached to the tester's remarks, and only then are tickets opened following a signal hierarchy (verbal remark → always a ticket; repeated cluster with estimable impact → triage ticket; isolated no-impact error → attached or ignored with a reason). The deliverable is not just the 5–10 tickets but a traceable result — a session summary plus an annotated trace where every network error and screenshot is accounted for.

Full step-by-step protocol → [`SKILL.md`](SKILL.md).

## Worked example

> A 40-minute session on acme-app: 28 timeline events, 45 captured network errors.

1. Correlation groups the 45 errors into 7 `(endpoint, status)` clusters; 4 align with tester remarks.
2. Two remarks describe the same broken screen with the same interaction → merged into one ticket.
3. A repeated `POST /export 500` cluster with no remark is estimated to drop rows silently → its own triage ticket.
4. The remaining isolated 401s are marked `ignored: no impact` in the trace.
5. Result: **6 tickets**, a session summary, and a trace where all 45 errors are accounted for.

## Related artifacts

- [`bug-ticket-root-cause`](../bug-ticket-root-cause/) — for a single observed bug, with its root cause.
- [`validating-features-end-to-end`](../validating-features-end-to-end/) — to prove a specific feature works, not to triage remarks.
- [`recurring-bug-root-cause`](../recurring-bug-root-cause/) — when the session surfaces the Nth instance of the same class.

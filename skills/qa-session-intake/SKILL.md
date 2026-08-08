---
name: qa-session-intake
description: Use when processing a recorded human QA session (timeline of verbal remarks, screenshots, captured network errors) into tracker tickets - "process the QA session", "create the QA tickets", "traite la session QA", "crée les tickets QA", a QA bundle folder to triage.
version: 1.0.1
metadata:
  last-reviewed: 2026-08-08
  category: process
---

# QA Session Intake - from a recorded QA session to tickets

> If the current repo has dedicated intake tooling, it wins - run its script instead of triaging by hand.

## This skill vs. others

- **This skill** when: triaging a recorded QA session bundle (timeline, screenshots, network errors) into tickets
- **`bug-ticket-root-cause`** if: a single observed bug outside a QA session, to document with its root cause
- **`validating-features-end-to-end`** if: the goal is to prove a specific feature works, not to triage remarks

## Principle

**One ticket per distinct problem, not per event.** A 40-minute session with 28 events and 45 network errors typically yields 5–10 tickets. 45 tickets = noise that buries the signal; 1 mega-ticket = untriageable.

## Context to gather (before acting)

- Inventory the bundle: timestamped timeline, screenshots (with timestamps), network-error log
- Tracker + the repo's format/label/severity conventions (the project's bug skill if it exists) - do not invent
- Existing open tickets, for de-duplication
- Version/build under test and the functional areas the session covered

## Triage

1. **Correlate before creating**: read the timeline in chronological order; group network errors by `(endpoint, status, message)`; attach each cluster to its time window and the tester's remarks; only look at screenshots that coincide with an event.
2. **Signal hierarchy**:
   - **Tester's verbal remark** → always a ticket (most reliable signal), merge if same screen + same interaction
   - **Repeated network cluster with no remark** → a triage ticket if the impact is estimable (missing data, silent failure) - do not ignore it because "the tester didn't notice": a silently failing endpoint can hide data loss
   - **Isolated network error with no visible impact** → attach to an existing ticket or mark as ignored with a reason
3. **Content of each ticket**: title from the user's point of view · steps reconstructed from the timeline (timestamps) · expected vs actual · closest screenshot attached · network requests from the ±5 s window if relevant · estimated severity.

## Traceability (nothing is lost silently)

Deliver alongside the tickets:
- **Session summary**: areas tested, breakdown by severity, areas not covered
- **Annotated trace**: each network error marked → `ticket #N` | `ignored: duplicate` | `ignored: no impact` - verifiable by anyone
- Unused screenshots listed with a reason

## Guardrails

- Do not create a ticket without reconstructed reproduction steps - a ticket "401 error somewhere" is unclosable
- De-duplication: search open tickets before creating
- Format/labels: follow the repo tracker's conventions (the project's bug skill if it exists)

## Traps & rationalizations

| Excuse | Reality |
|--------|---------|
| "45 network errors → I create 45 tickets" | One ticket per distinct problem, not per event. Correlate first; 5–10 tickets typical. |
| "Everything in one session mega-ticket" | Untriageable and unclosable. One problem = one ticket. |
| "The tester said nothing, I ignore the network error" | A silently failing endpoint can hide data loss. Triage if the impact is estimable. |
| "401 error somewhere, I create the ticket" | Without steps reconstructed from the timeline, the ticket is unclosable. |
| "I create quickly, I check duplicates later" | Search open tickets first - the duplicate pollutes the tracker. |

## Exit condition

- [ ] One ticket per distinct problem, each with reconstructed steps, expected vs actual, closest screenshot, severity
- [ ] Annotated trace: each network error marked `ticket #N` | `ignored: <reason>` - verifiable
- [ ] Session summary delivered (areas tested, severity breakdown, areas not covered)
- [ ] Unused screenshots listed with a reason
- [ ] De-duplication done against open tickets

## Tooling

- No generic script (triage depends on the bundle format): if the repo has dedicated intake tooling, run it (see header note).
- Follow the project bug skill's ticket template for the content of each ticket created.

## Changelog

- 1.0.1 (2026-08-08) - dropped the fictional example projects from the precedence note

- 1.0.0 (2026-06-19) - initial versioned release + state-of-the-art enrichment (routing, context, protocol, traps, exit condition)

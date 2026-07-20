# Rule - `detection-gap-protocol`

> If a user finds a P0 before your automation does, the bug is only half the problem - the missing detection is the other half.

| | |
|---|---|
| **Type** | Rule (path-scoped) |
| **Scope (`paths`)** | `docs/postmortems/**` |
| **Version** | 1.0.0 |
| **Artifact** | [`rules/detection-gap-protocol.md`](../../rules/detection-gap-protocol.md) |
| **Paired skills** | [`production-incident-diagnostic`](../../skills/production-incident-diagnostic/), [`detection-sweep`](../../skills/detection-sweep/), [`recurring-bug-root-cause`](../../skills/recurring-bug-root-cause/) |

## What it enforces

When a **P0 regression is reported by a user** - not by CI, E2E, smoke tests, or monitoring - the postmortem must treat the missing detection as a first-class failure. The rule mandates:

1. A postmortem using the dedicated **"detection gap" template**, not the standard one.
2. A **"Detection gap" section** analyzing every level that should have caught it.
3. A **regression test that would actually have caught the bug**, written at the right level (SPA navigation, mobile, deployed environment).
4. A **`detection-gap` label** on the originating ticket.
5. A **blocking lint** that rejects a user-reported postmortem lacking the "Detection gap" section.

## Why it matters

A fix removes one bug. Understanding **why every automated layer let it through** removes the whole class of bugs. If the response to a user-reported incident is only "we fixed it", the next regression of the same shape reaches users too - the safety net still has the same hole.

Making the user the discoverer of a P0 is itself the defect: it means CI, tests, smoke, and monitoring all passed on broken behavior. The protocol forces the team to name which layer failed and to close that layer, so the automation - not the customer - catches the next one. Aggregating the `detection-gap` label over time reveals **families of holes** and tells you where coverage investment pays off most.

## How to apply it

### Analyze every coverage level

| Level | Question to answer in the postmortem |
|-------|--------------------------------------|
| CI compile/lint | Did the code pass typecheck / lint / clippy? |
| Unit tests | Did a UT cover the broken invariant? |
| E2E tests | Did a scenario reproduce the user flow? |
| Post-deploy smoke | Did the smoke test hit this route? |
| Synthetic monitoring | Did a probe watch this endpoint in prod? |

For each level, state whether it *could* have caught the bug and why it did not.

### Write the test at the level that failed

If the bug only manifests after SPA client-side navigation, a unit test that passes in isolation does not close the gap - the regression test must reproduce the real flow that broke.

### Feed the recurring review

Label the ticket `detection-gap` so periodic reviews can cluster incidents and prioritize E2E / smoke / monitoring work against the biggest gap families.

## Related

- [`production-incident-diagnostic`](../../skills/production-incident-diagnostic/) drives the incident analysis that feeds the postmortem.
- [`detection-sweep`](../../skills/detection-sweep/) proactively hunts for the gaps before a user does.
- [`recurring-bug-root-cause`](../../skills/recurring-bug-root-cause/) handles the case where the same class of bug keeps returning.

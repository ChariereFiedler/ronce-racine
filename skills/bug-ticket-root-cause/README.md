# `bug-ticket-root-cause`

> Turn an observed bug into a ticket that names the actual mechanism at `file:line` and pins down the tests that will prove it fixed — without fixing it now.

| | |
|---|---|
| **Type** | Skill (on-demand workflow) |
| **Category** | `bug` |
| **Artifact** | [`SKILL.md`](SKILL.md) |
| **Tooling** | [`templates/bug-ticket.md`](templates/bug-ticket.md) |

## What it is

`bug-ticket-root-cause` defines the **content** of a good bug ticket, independent of the tracker. It takes an observed defect and produces a ticket that cites the real root cause in the production code, lays out reproduction scenarios, and specifies the confirmation tests that must fail before a fix and pass after. It deliberately stops short of fixing anything.

It is a **content** skill: if your repo has a project-specific ticketing skill (e.g. `add-bug`, `jira-bug`), that one owns the **format and tracker** — this one owns what goes inside.

## Why it exists

Most bug tickets fail in one of two ways:

1. **No cited cause.** "Login is broken, probably the token refresh" is a design hypothesis dressed up as an analysis. The next person re-investigates from scratch or fixes by trial and error. A ticket must name the *mechanism* and cite `file:line`, or honestly mark the cause `to investigate`.
2. **No confirmation tests.** Without a test that fails before the fix and passes after, nothing proves the bug is closed — and nothing stops it regressing. The confirmation-tests table is the heart of the ticket, not an afterthought.

The skill also enforces a hard boundary: it produces a ticket, *not* a fix. Mixing the fix into the investigation blurs the trace and defeats the purpose of documenting.

## When it triggers

Invoke it when you are documenting an observed bug as a ticket without fixing it now:

- "report a bug" / "create a bug ticket" / "it doesn't work"
- a regression you want to record but not fix in this session

Route elsewhere when:

- the scope already had 2+ similar recent fixes → `recurring-bug-root-cause` (it's a class)
- the goal is to fix *now* → `superpowers:systematic-debugging`
- the source is a recorded QA session with many issues → `qa-session-intake`
- the bug isn't reproduced or root-caused yet and the fix/ticket decision is still open → `bug-triage-structured`

## How it works

The skill moves from symptom to a written ticket without touching a fix: frame the observed-vs-expected symptom, investigate the real production code to name a *mechanism* at a cited `file:line`, then write the ticket (via `templates/bug-ticket.md`) with reproduction scenarios, a confirmation-tests table, and an argued priority. A recurrence check routes to `recurring-bug-root-cause` when the scope is already a repeat offender.

Full step-by-step protocol → [`SKILL.md`](SKILL.md).

### Guardrails

- Never assert a root cause without citing code.
- Never create the ticket without the confirmation-tests section.
- Never fix the bug inside this workflow.

## Worked example

> A user reports that saving a profile sometimes clears the avatar.

Framing: observed = avatar disappears on save; expected = avatar preserved; where = profile update endpoint; reproducibility = only when the form is submitted without re-selecting the avatar.

Investigation: tracing the update handler, the mechanism is that the serializer treats an absent `avatar_url` as an explicit `null` and overwrites the stored value. Cited `services/profile.ts:88`. `git blame` points to the commit that switched to a full-replace update. Hypothesis status: **confirmed**. Existing tests always sent an avatar, so they never exercised the absent-field path.

The ticket records that mechanism, three scenarios (submit without avatar → cleared; submit without avatar post-fix → preserved; submit with a new avatar → replaced), and a confirmation-tests table: a UT on the serializer asserting an absent field is not treated as `null` (❌ before / ✅ after), plus an API test on the endpoint. Priority: **high** (data loss, no workaround). No application file is touched.

## Related artifacts

- [`bug-triage-structured`](../bug-triage-structured/) — when reproduction and the fix/ticket decision are still open.
- [`recurring-bug-root-cause`](../recurring-bug-root-cause/) — when the bug is the Nth of its class in the same scope.
- [`recording-decisions`](../recording-decisions/) — for design choices, not bugs.

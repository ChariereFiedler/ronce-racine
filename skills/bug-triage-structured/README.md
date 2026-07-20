# `bug-triage-structured`

> Reproduce a fresh bug, locate its cause at `file:line`, then decide fix-now-vs-ticket on facts - always leaving behind a test that goes red before and green after.

| | |
|---|---|
| **Type** | Skill (on-demand workflow) |
| **Category** | `bug` |
| **Artifact** | [`SKILL.md`](SKILL.md) |
| **Tooling** | [`templates/bug-triage.md`](templates/bug-triage.md) |

## What it is

`bug-triage-structured` is the **full front-to-back triage** of a bug whose reproduction and cause are still unknown. It runs the complete cycle - reproduce, root-cause, decide, confirm - and forces the "fix now vs open a ticket" call to be made on evidence rather than on how urgent the bug feels. Whichever branch it takes, the output includes a confirmation test that fails before and passes after.

## Why it exists

The two most common triage failures are opposite mistakes:

1. **Fixing before understanding.** "It's obvious, I'll just fix it" leads to a change on an unconfirmed cause - a trial-and-error patch that may not address the real mechanism and often spawns the next bug of the same class.
2. **Deciding by vibe.** Choosing "fix now" or "ticket" on a sense of urgency, before the cause is located, means the decision isn't grounded in anything. The skill turns that into an explicit criteria table: a *confirmed*, localized, in-scope, low-risk cause may be fixed now; anything less becomes a ticket.

And in both branches it refuses to let the bug be called "handled" without a red-then-green confirmation test - the only thing that actually proves resolution.

## When it triggers

Invoke it when a bug arrives raw and the path forward is undecided:

- "reproduce and analyze this bug" / "triage this bug"
- "should we fix now or open a ticket?"
- a fresh bug report where reproduction and root cause are still unknown

Route elsewhere when a phase is already settled:

- decision is already "document, don't fix now" → `bug-ticket-root-cause` (no repro/decision phase)
- the scope already had 2+ similar recent fixes → `recurring-bug-root-cause` (it's a class)
- repro and cause are established and you're fixing → `superpowers:systematic-debugging`

## How it works

The skill runs the full triage cycle - reproduce, root-cause, decide, confirm - and forces the "fix now vs ticket" call to rest on evidence rather than urgency: a `confirmed`, localized, in-scope, low-risk cause may be fixed now, anything less becomes a ticket. Both branches must leave behind a confirmation test that goes red before and green after. `templates/bug-triage.md` captures all of this on one sheet and doubles as the tracker-agnostic ticket body when the decision is "ticket".

Full step-by-step protocol → [`SKILL.md`](SKILL.md).

## Worked example

> "The dashboard total is sometimes wrong - reproduce and analyze."

**Reproduce**: it's wrong specifically when a filter is applied and then cleared quickly. Minimal repro: apply the "last 7 days" filter, clear it within a second → total shows the filtered figure. Deterministic once the timing is pinned.

**Root-cause**: tracing the flow, a stale async response from the filtered request resolves *after* the cleared request and overwrites the total. Cited `hooks/useTotals.ts:52` - no request-sequence guard. `git blame` points to the commit that added the filter feature. Status: **confirmed**. Existing tests never raced two requests, so they missed it.

**Decide**: cause confirmed, fix is a localized request-token guard, low risk, in scope → **fix now**.

**Confirmation test**: a UT that fires a stale-then-fresh response order and asserts the total reflects the latest request - red on current code, green after adding the guard. Both outputs pasted.

Had the cause come back merely `strong`, or the fix touched the whole data layer, the same sheet would have become a ticket with the table filled and no code written.

## Related artifacts

- [`bug-ticket-root-cause`](../bug-ticket-root-cause/) - when the "document, don't fix" decision is already made.
- [`recurring-bug-root-cause`](../recurring-bug-root-cause/) - when the bug is the Nth of its class in the same scope.
- [`adversarial-feature-challenge`](../adversarial-feature-challenge/) - to surface bugs like this one before they reach a report.

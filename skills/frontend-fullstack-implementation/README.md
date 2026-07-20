# `frontend-fullstack-implementation`

> Build a frontend feature in strictly separated layers - model to presentation - so logic never leaks into components, subscriptions never leak memory, and every element stays testable.

| | |
|---|---|
| **Type** | Skill (on-demand workflow) |
| **Category** | `frontend` |
| **Artifact** | [`SKILL.md`](SKILL.md) |
| **Tooling** | None generic (reuse the project's own test/typecheck/lint commands) |

## What it is

`frontend-fullstack-implementation` is a construction discipline for interactive UI. It takes a written spec and turns it into a feature built **bottom-up in five strict layers** - types, store/state, composable/hook, page, components - with two cross-cutting rules that hold at every layer: a `data-testid` on every locator, and an explicit teardown for every subscription.

It is deliberately stack-agnostic. When the current repo has its own implementation skill that knows the framework and paths, that one wins; this skill is the fallback that encodes the layering principle everywhere.

## Why it exists

The two most expensive frontend mistakes are structural, not visual:

1. **Logic in the component.** It looks faster in the moment, but it becomes untestable, non-reusable, and re-runs on every mount. The fix is architectural: logic lives in the store or the composable, and the component only receives props and emits events.
2. **The uncleaned subscription.** A `subscribe`/`watch`/listener without a teardown leaks memory, accumulates ghost callbacks, and fires updates on unmounted components. The fix is a hard rule: every subscription has a matching teardown.

Two more recurring regressions - missing empty/error states and text/class-based test locators - are prevented by the same up-front discipline: handle all four states from the page, and anchor every locator with a `data-testid`.

## When it triggers

Invoke it when implementing a frontend feature end-to-end, once the spec exists:

- "implement the frontend for X" / "add the X page"
- structuring the types/state/logic/UI layers of a new screen or interactive component
- adding `data-testid` attributes for testability
- guarding against subscription leaks

If the spec/ticket is **not** written yet, use [`frontend-spec-call-site-audit`](../frontend-spec-call-site-audit/) first.

## How it works

The feature is built bottom-up in five strictly separated layers - types/models, store/state, composable/hook, page (handling all four loading/error/empty/success states), then pure presentation components - with logic never descending into the component. Two non-negotiable cross-cutting rules hold at every layer: a stable `data-testid` on every locator (never a text- or class-based one), and an explicit teardown for every subscription, watcher, listener or timer. Validation (tests + typecheck + lint) is run and its real output pasted, never "it should pass".

Full step-by-step protocol → [`SKILL.md`](SKILL.md).

## Worked example

> The spec asks for a "Webhooks" list page in an existing app.

1. **types**: `Webhook` DTO with `status: 'active' | 'paused' | 'failed'`, `createdAt: string`.
2. **store**: `webhooks`, `loading`, `error`; a `fetchWebhooks()` action calling the project's authenticated fetch helper.
3. **composable**: `useWebhooks()` exposing `isEmpty` and a filtered view - derived, not stored.
4. **page**: renders `webhooks-loading` / `webhooks-error` / `webhooks-empty` (message + CTA) / `webhooks-list`, no inline logic.
5. **components**: a `WebhookRow` taking a typed prop and emitting `pause`/`resume`, with `data-testid="webhooks-item-${id}"`.
6. **cleanup**: the polling that refreshes statuses is torn down on unmount.
7. **validation**: tests + typecheck + lint run, output pasted.

## Related artifacts

- [`frontend-spec-call-site-audit`](../frontend-spec-call-site-audit/) - run first when the spec/ticket does not exist yet.
- [`refactoring-shared-component-api`](../refactoring-shared-component-api/) - when changing the public API of an already-shared component, with no new feature.
- [`writing-robust-tests`](../writing-robust-tests/) - to cover the feature once implemented.

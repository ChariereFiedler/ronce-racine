# `design-system-component-lifecycle`

> A design system component is a file *plus* its enforcement — create it, migrate every raw call site, and make the raw pattern a lint error, or it stays decorative.

| | |
|---|---|
| **Type** | Skill (on-demand workflow) |
| **Category** | `frontend` |
| **Artifact** | [`SKILL.md`](SKILL.md) |
| **Tooling** | [`templates/component-contract.md`](templates/component-contract.md) (stack-specific grep/lint) |

## What it is

`design-system-component-lifecycle` governs the full life of a shared UI component: the **decision** to create it, the **contract** that defines its API, and — the part that usually gets skipped — the **enforcement** that keeps the raw pattern it replaces from creeping back in. It treats "add a component" as a four-step batch, not a single file drop.

## Why it exists

Design systems decay in a predictable way. Someone builds a proper component, migrates the one call site that prompted it, and moves on. The raw pattern (an inline `<input>` with hardcoded styles, a bespoke card, a literal `#3b82f6`) is still legal everywhere else, so the next person copies it again. The DS component becomes decorative — one blessed usage surrounded by duplicated one-offs, exactly the mess it was meant to end.

The fix is to make the raw pattern **impossible to reintroduce silently**. That requires three synchronized layers of enforcement, and a component isn't "done" until all three exist.

## When it triggers

Invoke it when you are:

- creating a new DS component or adding a variant
- covering a repeated raw element/pattern with a reusable component
- defining a reusable component contract (props/slots/events, tokens)
- enforcing token usage over hardcoded values
- reacting to "add a component", "we need a component for", or an element repeated across pages

Use `refactoring-shared-component-api` instead when the component already exists and you are only changing its API. Use `frontend-spec-call-site-audit` upstream when you are specifying a feature that merely *consumes* the DS.

## How it works

Adding a component is treated as a four-step batch, not a file drop: a **decision** (no existing DS component or external primitive already covers the need; atom vs molecule), a **contract** (two-way API, state props, tokens instead of hardcoded values, pass-through `testid`), **implementation + migration** of every raw call site until its grep drops to 0, and **enforcement** across three synchronized layers — doc (DS index mapping), lint (raw pattern becomes an error), and test (unit + runtime audit). Enforcement is the part that usually gets skipped and the reason a component stays decorative without it.

Full step-by-step protocol → [`SKILL.md`](SKILL.md).

The [`component-contract.md`](templates/component-contract.md) template gives you a fill-in-the-blanks form covering the decision, API table, token mapping, testid, call-site list, and the enforcement checklist.

## Worked example

> Three pages each hand-roll a labelled text field: a bare `<input>` with an adjacent `<label>` and inline `padding: 8px; border: 1px solid #ccc`.

1. **Decision**: the DS has no field component and the external lib only ships an unstyled `<input>`. This is an atom, named per the project prefix. `grep` finds the pattern in 3 files.
2. **Contract**: fill the template — value + update event (two-way), `label`/`hint`/`error`/`disabled`/`required`, `size` variant, all styling via tokens (spacing token instead of `8px`, border/color tokens instead of `#ccc`), `testid` passed through.
3. **Implementation**: build the atom, migrate all 3 call sites; the raw-`<input>` grep now returns 0.
4. **Enforcement**: document the atom in the DS index (map the raw `<input>` pattern to it), add a lint rule flagging inline-styled bare inputs with a dedicated message (tested across `<src>`), and add a unit test for testid/value/states.

Then run lint + typecheck + tests and paste the output.

## Related artifacts

- [`refactoring-shared-component-api`](../refactoring-shared-component-api/) — for changing the API of a component that already exists.
- [`frontend-spec-call-site-audit`](../frontend-spec-call-site-audit/) — upstream, when specifying a feature that consumes the DS without extending it.

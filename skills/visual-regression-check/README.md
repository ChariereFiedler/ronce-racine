# `visual-regression-check`

> Green tests never see a broken grid, a mobile overflow, or an `undefined` on screen. Before committing a UI change, look at the real rendering - on desktop and mobile.

| | |
|---|---|
| **Type** | Skill (on-demand workflow) |
| **Category** | `frontend` |
| **Artifact** | [`SKILL.md`](SKILL.md) |
| **Tooling** | None dedicated (Playwright MCP + project dev command) |

## What it is

`visual-regression-check` is a pre-commit detection net for UI changes. It drives the running app, captures each affected surface in a desktop and a mobile viewport across the reachable states, and inspects each capture with an objective checklist. It is not a design review - it hunts for *broken*, not for *ugly*.

## Why it exists

Typecheck, lint, and unit tests are blind to rendering. They pass while a grid collapses, a mobile column overflows, a component never mounts, or an empty state prints `undefined`. Vision catches these reliably - but only if someone actually looks, and looks at **both** viewports and the **non-nominal states**.

Mobile (375px) is blind spot #1: overflow and wrap only appear when narrow. Empty/error/loading states are blind spot #2: that is where `undefined`, `NaN`, and raw i18n keys surface. The skill forces coverage of both so a green build is not mistaken for a correct rendering. It explicitly does **not** replace human visual testing - it assumes no one else will look, and acts as the gate before commit.

## When it triggers

- a UI change is about to be committed
- "does it render well?" / "does it display correctly?"
- suspected visual regression, layout/restyle changed
- green tests but the rendering never actually seen

Use `validating-features-end-to-end` instead if the question is whether the feature *works* (golden path, API, DB), and `commit-readiness-review` if the question is whether it is *committable* (secrets, lint, leftovers).

## How it works

You drive the running app, navigate to each affected surface (a shared component means at least two consuming surfaces), and capture every surface in both a desktop (1280×720) and a mobile (375×812) viewport across the reachable states - nominal, empty, error, loading. Each capture is inspected with vision against an objective checklist (nothing truncated/overflowing, the change actually renders, no `undefined`/`NaN`/raw i18n key, legible text, consistent layout on both viewports) and compared to the pre-change state and any snapshot harness. Trace the verdict - surfaces, viewports, states, capture paths, anomalies, what was not checked - in the MR description.

Full step-by-step protocol → [`SKILL.md`](SKILL.md).

## Worked example

> On acme-app you restyle the results table into a card grid.

1. Diff touches `ResultCard` (shared) → check the search page and the dashboard.
2. Capture both surfaces at 1280×720 and 375×812, in nominal and empty states.
3. Mobile capture reveals the card grid overflowing horizontally at 375px - fixed before commit, re-captured.
4. Empty state (filter with no results) rendered a bare `undefined` where the count should be - fixed.
5. Verdict traced: 2 surfaces × 2 viewports × 2 states, anomalies fixed, loading state flagged "not reached".

## Related artifacts

- [`validating-features-end-to-end`](../validating-features-end-to-end/) - for the functional side (does it *work*).
- [`refactoring-shared-component-api`](../refactoring-shared-component-api/) - when the UI change is a shared-contract change.
- [`writing-robust-tests`](../writing-robust-tests/) - to lock the rendering behind a test once verified.

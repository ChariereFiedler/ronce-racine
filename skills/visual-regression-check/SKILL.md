---
name: visual-regression-check
description: Use when a UI change is about to be committed and its real rendering needs checking on desktop and mobile - "does it render well?", "does it display correctly?", "ça rend bien ?", "est-ce que ça s'affiche bien ?", suspected visual regression, layout/restyle changed, green tests but the rendering never seen.
version: 1.0.0
metadata:
  last-reviewed: 2026-06-19
  category: frontend
---

# Visual regression check - see the real rendering before commit

> If the current repo has a dedicated visual skill (e.g. acme-app → `visual-self-review`), it wins - it knows the pages, the snapshot harness, and the project commands.

## This skill vs. others

- **This skill** when: a UI change is ready to commit - you must see the **real rendering** (not just the tests) on desktop AND mobile, and catch anything broken
- **`validating-features-end-to-end`** instead if: the question is "does the feature *work*" (golden path, API, DB) - functional evidence, not rendering
- **`commit-readiness-review`** instead if: the question is "is it committable" (secrets, lint, debug leftovers)

## Principle

- **"Green tests ≠ correct rendering"**: typecheck/lint/unit do not see a broken grid, a mobile overflow, a never-mounted component, an `undefined` on screen. Vision detects them reliably.
- You are **not** asked for an aesthetic judgment but for detecting what is *broken*: overlapping layout, truncated text, overflow, an empty state showing `undefined`.
- **This is NOT a substitute for human visual testing**: it is a detection net before commit, not a design validation.

## Context to gather (before acting)

- **Which surfaces are affected**: from the diff, which pages/screens render the changed components. A shared component = check at least 2 consuming surfaces.
- **How to run the app** locally (dev command + URL/port) - read `package.json` / `Makefile` / the project config.
- **States to cover**: nominal + reachable ones - empty (filter with no results), error (500 response), loading if stable.
- **Viewports**: desktop **1280×720** + mobile **375×812** by default; adapt to the project's real breakpoints.

## Protocol

1. **Start the app** for real (dev command) and wait until it responds.
2. **Navigate** to each affected surface (`browser_navigate`).
3. **Capture each surface in each viewport**: `browser_resize` 1280×720 → `browser_take_screenshot`; then `browser_resize` 375×812 → screenshot. Save under a readable path (`<surface>-<viewport>-<state>.png`).
4. **Cover the states**: nominal, empty, error, loading (those reachable; flag the ones not reached).
5. **Inspect each capture** (vision) with the objective checklist below.
6. **Compare** to the expected rendering / the state before the change (and to the project's snapshot harness if it exists).

Inspection checklist:

```
- [ ] Nothing truncated, overlapping, overflowing; no horizontal scroll on mobile
- [ ] The expected change is visible (the component actually renders - orphan-component trap)
- [ ] Empty/error/loading states rendered, no undefined/NaN/raw i18n key on screen
- [ ] Text legible against the background (contrast), density consistent with neighboring surfaces
- [ ] Layout consistent on desktop AND mobile (both viewports re-read)
```

## Templates

Verdict to trace (MR description / report):

```
Surfaces checked: <list>
Viewports: desktop 1280×720 ✅ · mobile 375×812 ✅
States: nominal ✅ · empty ✅ · error ✅ · loading <✅/not reached>
Captures: <paths>
Anomalies: <fixed before commit / none>
Not checked: <unreachable state/surface - explicit>
```

## Traps & rationalizations

| Excuse | Reality |
|--------|---------|
| "The tests pass so the rendering is fine" | typecheck/lint/unit see neither a broken grid nor a never-mounted component. |
| "I looked on desktop, that's enough" | Mobile (375px) is blind spot #1: overflow and wrap only appear when narrow. |
| "No need for the empty/error state" | That is where `undefined`/`NaN`/raw i18n keys surface. One state = partial evidence. |
| "A human review will validate it" | This skill does not replace the human, but does not assume they will look: be the detection gate before commit. |

## Exit condition

- [ ] Desktop **and** mobile captures of each affected surface, read with the checklist
- [ ] Empty/error states checked or explicitly flagged as not checked
- [ ] Compared to the project's snapshot harness if it exists (intentional diff re-read, otherwise fixed)
- [ ] Verdict + capture paths traced - never "it should render"

## Tooling

- Browser driving via Playwright MCP: `mcp__<server>__browser_navigate`, `mcp__<server>__browser_resize`, `mcp__<server>__browser_take_screenshot` (and `browser_snapshot` for the accessibility tree).
- Failing that: the project's E2E runner / visual snapshot harness (read its config).
- No dedicated script here: dev command and viewports are project-specific.

## Changelog

- 1.0.0 (2026-06-19) - initial generic release extracted from acme-app/visual-self-review (stack coupling removed, viewports parameterizable)

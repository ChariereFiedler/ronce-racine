---
name: frontend-fullstack-implementation
description: Use when implementing a frontend feature end-to-end - "implement the frontend for X", "add the X page", "implémente le frontend pour X", "ajoute la page X", structuring types/state/logic/UI layers, adding data-testid attributes, or avoiding subscription leaks. Use for any new screen or interactive component once the spec exists.
version: 1.0.1
metadata:
  last-reviewed: 2026-08-08
  category: frontend
---

# Frontend feature implementation - strict layer separation

> If the current repo has a specific implementation skill, it wins - it knows the stack, the paths, the fetch helpers and the project commands.

## This skill vs. others

- **This skill** when: coding a frontend feature end-to-end (page, screen, interactive component) from an existing spec
- **frontend-spec-call-site-audit** instead if: the spec/ticket is not written yet (call-site audit + acceptance criteria BEFORE implementing)
- **refactoring-shared-component-api** instead if: changing the public API of an already-shared component, with no new feature
- **writing-robust-tests** in addition: to cover the feature once implemented

## Principle

A frontend feature is built in **strictly separated layers**, in order, from model to presentation:

1. **types/models** - DTOs mirroring the API contract
2. **store/state** - shared state + actions (mutations), never scattered fetches
3. **composable/hook** - reusable logic derived from state
4. **page** - routing + selecting the state to display
5. **components** - pure presentation, driven by props

Two non-negotiable cross-cutting disciplines: **`data-testid` on every locator** (nothing is testable without a stable anchor) and **cleanup of every subscription** (a `subscribe`/`watch`/listener without teardown leaks). Logic **never** descends into the component.

## Context to gather (before acting)

- Framework + commands: read `package.json` / CI config for the `test`, `typecheck`, `lint` scripts
- **Read a neighbouring feature already shipped** and copy its conventions (layer naming, authenticated fetch helper, empty states, i18n) before inventing
- Project request helper: is there a wrapper (auth/JWT, 401 handling) to use instead of the raw HTTP call?
- Does the compiler check templates and props strictly? If not, manually check every prop passed

## Protocol

```
- [ ] 1. types/models: DTOs mirroring the API contract, statuses as literal unions
- [ ] 2. store/state: minimal state (loading/error/data), actions = only mutation point, no raw fetch
- [ ] 3. composable/hook: derived values (computed), no state duplication
- [ ] 4. page: route + 4 explicit states (loading / error / empty / success), zero inline logic
- [ ] 5. components: pure presentation, typed props, no direct store access
- [ ] 6. data-testid on every locator (page, each state, each interactive element, list items)
- [ ] 7. cleanup: every subscription / watch / listener has its teardown
- [ ] 8. validation: tests + typecheck + lint run, output pasted
```

### 1. types/models

Types mirror the API contract (statuses as literal unions, ISO dates as `string`). If a generator exists (OpenAPI → types), use it; otherwise write them by hand.

### 2. store/state

Minimal state: data + `loading` + `error`. **Every mutation goes through an action**, never from the presentation layer. No derived data stored - derive it as `computed`. Go through the project fetch helper (auth, 401), not the raw HTTP call.

### 3. composable/hook

Encapsulates reusable logic (selecting the current item, `isEmpty`, filters) as derived values. No copy of the store state.

### 4. page

Wires the route, triggers loading, and renders **all four states** - each with a distinct `data-testid`:

```
loading  → data-testid="<domain>-loading"
error    → data-testid="<domain>-error"
empty    → data-testid="<domain>-empty"
success  → data-testid="<domain>-list"
```

No logic in the template: delegate to the composable.

### 5. components

Pure presentation: typed props in, events out. No direct store access. Reuse an existing component before creating a new one; check that no created component is orphaned (actually mounted somewhere).

### 6. data-testid

On **every locator**: page container, each state, each interactive element (button, input, link), each list item (`data-testid="<domain>-item-${id}"`). A locator by CSS class or by text is fragile - it breaks on the slightest restyle or label change.

### 7. subscription cleanup

Every subscription has an explicit teardown, on component unmount:
- manual subscription (`subscribe`, stream subscription) → keep the handle and release it
- watcher / effect → release its handle, or use an auto-disposed effect
- DOM listener / timer → `removeEventListener` / `clearInterval`
- framework-idiomatic mechanism (destroy signal, teardown hook) → use it systematically

### 8. validation

```bash
npm run test       # or the project equivalent
npm run typecheck
npm run lint
```

## Templates

- No file template: copy the structure of a neighbouring feature in the repo (naming conventions, fetch helper, empty states).

## Traps & rationalizations

| Excuse | Reality |
|--------|---------|
| "I'll put the logic straight in the component, it's faster" | Untestable, non-reusable logic that re-fetches on every mount. It lives in the store or the composable. |
| "I'll fetch directly, no need for the helper" | You lose auth, 401 handling and centralized error handling. Always the project helper. |
| "No need for data-testid, I'll target by text/class" | A locator by text breaks on the 1st translation, by class on the 1st restyle. data-testid on every locator. |
| "The subscription will clean itself up" | No: it leaks, accumulates callbacks and triggers updates on an unmounted component. Explicit teardown. |
| "Empty / error state, I'll do it later" | The 4 missing states are the most frequent regressions. All 4 from the page onward. |
| "The component accesses the store just to be faster" | Presentation↔state coupling: the component becomes untestable in isolation. Props in, events out. |

## Exit condition

- [ ] Layers shipped in order: types → state → logic → page → components
- [ ] Every state mutation goes through an action; no raw fetch outside the project helper
- [ ] The 4 states (loading/error/empty/success) handled, each with a distinct `data-testid`
- [ ] `data-testid` on every locator (interactive + list items)
- [ ] Every subscription/watch/listener has a teardown; grep of subscriptions without cleanup = 0
- [ ] No orphaned component; zero logic in templates
- [ ] Tests + typecheck + lint run, output pasted - never "it should pass"

## Tooling

- Reuse the current repo's scripts and commands (lint, typecheck, type generation). No generic tool provided here: detecting uncleaned subscriptions is framework-dependent - write it in the project skill.

## Changelog

- 1.0.1 (2026-08-08) - dropped the fictional example projects from the precedence note

- 1.0.0 (2026-06-19) - initial version, generalized from a project-specific Vue/Nuxt/Pinia workflow (stack coupling removed)

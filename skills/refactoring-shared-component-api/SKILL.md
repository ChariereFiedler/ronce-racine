---
name: refactoring-shared-component-api
description: Use when changing the public API (props, emits, slots, events, exported signatures) of a UI component or module consumed in 2+ places - renaming a prop, removing a parameter, changing a contract - "change this shared component's API", "change l'API de ce composant partagé", "rename this prop", "renomme cette prop". Also use when a typecheck passes but the change touches a shared contract.
version: 1.0.0
metadata:
  last-reviewed: 2026-06-19
  category: frontend
---

# Refactoring a shared component's API

> If the current repo has a dedicated skill or conventions for this case (e.g. acme-app → `shared-component-refactor`), they win.

## This skill vs. others

- **This skill** when: changing the public API (props/emits/slots/events/exported signature) of a component or module consumed in 2+ places
- **frontend-spec-call-site-audit** instead if: specifying a new feature, not changing an existing contract
- **writing-robust-tests** alongside: to write the integration-point tests in step 4

## Principle

A shared-API refactor is **not done when the typecheck passes**: it is done when **every grepped call site** is migrated or justified. Many frameworks (Vue fallthrough attrs, dynamic JS, untyped templates) silently accept an unknown prop/argument — no compile, typecheck, or runtime signal.

## Context to gather (before acting)

- Does the compiler check templates strictly (`strictTemplates`, typed JSX)? If not, the silent-contract check in step 3 is **manual and mandatory**
- Typecheck + test commands: read `package.json` / `Cargo.toml` / CI
- Locate existing compatibility wrappers around the component — these are the most often forgotten consumers

## Checklist (mandatory order, no step is optional)

### 1. Exhaustive sweep BEFORE touching the component — `scripts/sweep-call-sites.ts`
- Grep every call site — all casings (`<MyBadge`, `<my-badge`), dynamic usages (`:is=`, factories), object spreads (`v-bind="obj"`, `{...props}`)
- **Compatibility wrappers are first-class call sites** — the wrapper whose only job is to preserve the old interface is the most often forgotten consumer
- Include: stories/fixtures/mocks, docstrings that reference the old API
- List every call site; that is the migration checklist

### 2. Migration
- Migrate each listed call site, ticking them off as you go
- For each removed or renamed prop/parameter: grepping the old name must return **0 occurrences** among consumers

### 3. Silent-contract check
- For each migrated call site: open the consumed component and verify that **every prop/argument passed is declared** in its interface
- If the compiler checks templates strictly (e.g. `strictTemplates`), the typecheck is enough; otherwise this check is **manual and mandatory**

### 4. Integration-point tests
- Every wrapper/adapter touched gets its **own mount test** (the event bubbles up, the prop drives the render) — these bugs are invisible until a human exercises the feature

### 5. Validation
- Unit tests + typecheck; verify the existing tests actually exercise the prop name (a test on a CSS class passes even if the rename is incomplete)

## Templates

- `templates/migration-checklist.md` — migration checklist to paste into the MR (call sites + status)

## Traps & rationalizations

| Excuse | Reality |
|--------|---------|
| "The typecheck passes, it's done" | Fallthrough attrs, dynamic JS, and untyped templates accept an unknown prop without complaint. The call-site sweep is authoritative. |
| "The compat wrapper isn't really a call site" | It's the most often forgotten consumer, and its only job is to carry the old interface. Sweep mandatory. |
| "A global sed on `variant` will be faster" | A generic name touches unrelated components. Migrate file by file. |
| "The existing tests pass" | A test on a CSS class passes even if the rename is incomplete. Verify they exercise the prop name. |

## Exit condition

- [ ] Exhaustive sweep run (`scripts/sweep-call-sites.ts`), all call sites listed
- [ ] Each call site migrated or justified (not affected); grep of the old name = **0 occurrences** among consumers
- [ ] Silent-contract check done (every prop passed is declared in the component's interface)
- [ ] Mount test on each wrapper/adapter touched
- [ ] Tests + typecheck run, output pasted — never "it should pass"
- [ ] Deliverable: list of call sites + status (migrated / removed / not affected, justified)

## Tooling

- `scripts/sweep-call-sites.ts <ComponentName> [rootDir]` — automatic sweep (casings, dynamic usages, spreads, **suspicious wrappers highlighted**, stories/mocks), output = markdown checklist

## Changelog

- 1.0.0 (2026-06-19) — initial versioned release + state-of-the-art enrichment (routing, context, protocol, traps, exit condition)

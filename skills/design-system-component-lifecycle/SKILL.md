---
name: design-system-component-lifecycle
description: Use when creating or extending a design system component, defining a reusable component contract (props/slots/events, tokens), enforcing token usage over hardcoded values, or avoiding duplicated one-off components - "add a component", "a component is needed for", "ajoute un composant", "il manque un composant pour", element/pattern repeated across pages.
version: 1.0.1
metadata:
  last-reviewed: 2026-08-08
  category: frontend
---

# Design system component lifecycle - decision → contract → enforcement

> If the current repo has an equivalent skill, it wins - it knows the component prefix, the lint rules, and the project's audit specs.

## This skill vs. others

- **This skill** when: creating a new DS component, adding a variant, covering a repeated raw pattern/element with a reusable component, or enforcing token usage
- **`refactoring-shared-component-api`** instead if: evolving the API (props/slots/events) of an **already-shared** component - no creation decision
- **`frontend-spec-call-site-audit`** upstream if: specifying a feature that consumes the DS without extending it

## Principle

A DS component is not just a view file: it is a file **+ its enforcement**. Without enforcement (doc, lint, test), the raw pattern stays allowed elsewhere and the component becomes decorative - you fall back into the duplicated one-offs it was meant to eliminate. The expected output: component created, **all** the call sites of the raw pattern migrated, and the raw pattern now detected as an error.

## Context to gather (before acting)

- **Inventory the existing DS**: does a component already cover the need? Read the components index/README (atoms, molecules) and the token library before inventing anything
- **External library**: does a primitive from an existing third-party UI lib cover the need? Reuse before creating
- **Atom or molecule?** Atom = primitive/control with no business logic · molecule = composition of atoms. Follow the project's naming/folder convention (a prefix often serves as the lint exemption)
- **Inventory ALL the call sites of the raw pattern** (`grep -rn '<raw pattern>' <src>`) - migrating them is part of the batch, not just the requesting call site
- Lint / typecheck / test commands: read `package.json` / CI config

## Protocol

```
- [ ] 1. Decision: justify that no existing component nor external primitive covers the need
- [ ] 2. Contract: props/slots/events, tokens, testid, state (label/hint/error/disabled…)
- [ ] 3. Implementation: component + migration of ALL raw call sites
- [ ] 4. Enforcement: doc + lint + tests synchronized (all 3 layers)
```

### 1. Decision (in this order)

1. Does an existing DS component cover the need (possibly via a variant)?
2. Does a primitive from an external UI lib cover it?
3. Atom or molecule? Place/name it per the project convention
4. List every call site of the raw pattern to migrate

### 2. Component contract

- **Two-way API** aligned with the project convention (a single name for the value + its update event), not a mix of conventions
- **State props** aligned with a reference neighboring component (`label`, `hint`, `error`, `disabled`, `required`, `size`) rather than reinvented
- **Tokens, no hardcoded values**: colors/spacing/typography go through the DS tokens - a literal value (hex, px) bypasses the contract
- **`testid` as pass-through** from the call site, never hardcoded in the component (two instances on the same page = collision)
- Variant with no safe default → make it **required** rather than picking an arbitrary default

### 3. Implementation + migration

- Migrate each call site listed in step 1; grep of the raw pattern = **0 occurrences** outside an explicit exemption
- Anti-orphan: the new component has ≥ 1 real usage

### 4. Enforcement (the heart of the skill) - 3 synchronized layers

| Layer | Goal | Action |
|-------|------|--------|
| Doc | discoverability | Add the component to the DS index/README (raw pattern → component mapping) |
| Lint | prevent recurrence | Remove the raw pattern from the exemptions and give it a dedicated error message; autofix **only** if the transformation is mechanically safe. Test the rule on a witness file then on the whole `<src>` |
| Test | runtime proof | Component unit test (testid, value, states) + visual snapshot if the render is non-trivial + runtime audit that fails if the raw pattern reappears (when the DOM signal is reliable) |

## Templates

- `templates/component-contract.md` - component contract to fill in (API, tokens, testid, enforcement)

## Traps & rationalizations

| Excuse | Reality |
|--------|---------|
| "I'll just make a quick local component for this page" | That's a duplicated one-off. Inventory the DS first; if the need is reusable, it goes in the DS. |
| "This exact hex/px isn't in the tokens" | Either the token exists and must be used, or the token is missing and must be added - not a hardcoded value that escapes the contract. |
| "The component works, enforcement can come later" | Without lint/test, the raw pattern stays allowed elsewhere: the component is decorative, not a DS extension. |
| "The requesting call site is migrated, that's enough" | The other raw call sites remain debt; the grep of the pattern must drop to 0. |

## Exit condition

- [ ] Decision documented: why neither an existing component nor an external primitive
- [ ] Contract defined: consistent two-way API, tokens (zero hardcoded value), testid as pass-through
- [ ] ALL call sites of the raw pattern migrated (grep = 0 outside an exemption)
- [ ] Anti-orphan: ≥ 1 real usage of the new component
- [ ] Enforcement: doc + lint (exemption removed) + test/audit - all 3 layers
- [ ] Lint + typecheck + tests run, output pasted - never "it should pass"

## Tooling

- No generic script: raw-pattern detection (`grep`) and the lint rule are stack-specific; tool them in the project skill.

## Changelog

- 1.0.1 (2026-08-08) - dropped the fictional example projects from the precedence note

- 1.0.0 (2026-06-19) - initial version generalized from a project-specific design-system-extension workflow

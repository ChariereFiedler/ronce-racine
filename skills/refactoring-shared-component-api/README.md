# `refactoring-shared-component-api`

> Changing a shared component's public API isn't done when the typecheck passes - it's done when every grepped call site is migrated or justified.

| | |
|---|---|
| **Type** | Skill (on-demand workflow) |
| **Category** | `frontend` |
| **Artifact** | [`SKILL.md`](SKILL.md) |
| **Tooling** | [`scripts/sweep-call-sites.ts`](scripts/sweep-call-sites.ts), [`templates/migration-checklist.md`](templates/migration-checklist.md) |

## What it is

`refactoring-shared-component-api` is a checklist for one dangerous operation: changing the public contract (props, emits, slots, events, exported signature) of a component or module consumed in two or more places. It replaces "the compiler is happy" with a concrete, greppable definition of done.

## Why it exists

The whole trap is that the compiler lies here. Vue fallthrough attrs, dynamic JS, and untyped templates silently accept an unknown prop or argument - no compile error, no typecheck error, no runtime error. So a rename can "pass" everywhere while half the call sites are quietly broken, only surfacing when a human exercises the feature.

The most-forgotten consumer is the **compatibility wrapper** - the thin layer whose only job is to carry the old interface. It looks like plumbing, not a call site, so it gets skipped; and skipping it defeats the entire migration. The skill treats wrappers as first-class call sites and makes the call-site sweep - not the typecheck - authoritative.

## When it triggers

- renaming a prop, removing a parameter, changing a contract on a component/module used in 2+ places
- any change to props/emits/slots/events/exported signatures of shared UI or modules
- when a typecheck passes but the change touches a shared contract

Use `frontend-spec-call-site-audit` instead when specifying a *new* feature rather than changing an existing contract, and pair with `writing-robust-tests` for the integration-point tests.

## How it works

The approach is a mandatory-order checklist that makes the call-site sweep - not the typecheck - the authority. You run [`scripts/sweep-call-sites.ts`](scripts/sweep-call-sites.ts) first (zero-dependency; finds every casing, dynamic usage, object spread, and stories/mocks, and flags suspicious wrappers as first-class call sites), migrate each site until the old name greps to zero among consumers, then verify with a silent-contract check, wrapper/adapter mount tests, and a validation run. Paste the [migration checklist](templates/migration-checklist.md) into the MR with each call site's status.

Full step-by-step protocol → [`SKILL.md`](SKILL.md).

## Worked example

> On acme-app you rename `<StatusBadge variant>` to `tone`.

1. `sweep-call-sites.ts StatusBadge` lists 9 call sites and flags `LegacyStatusBadge.vue` as a suspicious wrapper.
2. You migrate all 9; `grep -r 'variant' ` on consumers returns 0.
3. The wrapper passed `variant` through untyped - no typecheck error would have caught it. You update it and add its mount test.
4. An existing test asserted a `.badge--ok` CSS class (still green with the old prop) - you rewrite it to assert the `tone` prop drives the render.
5. MR ships with the checklist: 8 migrated, 1 wrapper migrated + tested, 0 old-name occurrences.

## Related artifacts

- [`writing-robust-tests`](../writing-robust-tests/) - for the wrapper/adapter mount tests.
- [`visual-regression-check`](../visual-regression-check/) - to confirm the migrated component still renders correctly.
- [`validating-features-end-to-end`](../validating-features-end-to-end/) - when the contract change is part of a feature to validate.

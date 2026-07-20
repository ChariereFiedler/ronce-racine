# `writing-robust-tests`

> A green test you have never seen red proves nothing. The deliverable isn't "tests written" - it's tests whose failure has been demonstrated.

| | |
|---|---|
| **Type** | Skill (on-demand workflow) |
| **Category** | `test` |
| **Artifact** | [`SKILL.md`](SKILL.md) |
| **Tooling** | [`testing-advanced`](../comprehensive-test-strategy/reference/testing-advanced.md) reference (shared with `comprehensive-test-strategy`) |

## What it is

`writing-robust-tests` is a design-plus-evidence method for adding tests to existing code that lacks coverage. It combines ISTQB test-design techniques (applied, not copied) with a hard rule: every test must be seen failing before it is trusted.

## Why it exists

Two failure modes make test suites worthless:

1. **The Liar** - a test that stays green even when the code under test is broken. It asserts nothing meaningful (an over-permissive mock, a CSS-class check, an empty fixture) and gives false confidence.
2. **The fragile E2E** - locators tied to wording, hard `sleep`s, assertions coupled to implementation timing, or a fully-mocked "E2E" that is really a UI test and can never catch a backend contract break.

The skill kills the Liar with a mandatory mutation step (break the code, watch the test go red, restore) and kills fragility with strict E2E rules: `data-testid` for every locator, page objects, zero hard waits, and a deliberate choice of test level.

## When it triggers

- "write tests for X" / "cover this file" / "add tests"
- code shipped without sufficient tests
- flaky or fragile suites to harden

Use `superpowers:test-driven-development` instead when the code does not exist yet (test first), and `detection-sweep` for a whole-project audit rather than a targeted file.

## How it works

The method pairs ISTQB test design with a hard evidence rule. You first adapt to the project (framework, neighboring-test conventions, reference fixtures - never invented data), then design deliberately: level first (unit ~70% / integration-contract ~20% / E2E ~10%), black-box techniques, error guessing, and the FIRST properties. E2E work obeys non-negotiable rules - `data-testid` for every locator, page objects, zero hard waits, no timing coupling - and mocking stays at the boundaries only so a fully-mocked "E2E" is called what it is. Finally, every test must be seen failing: run green, break the code under test until it goes red with a readable message, restore. A test still green with broken code is a Liar and gets rewritten.

Full step-by-step protocol → [`SKILL.md`](SKILL.md).

## Worked example

> On acme-app, a `formatInvoiceTotal` helper ships without tests.

1. Read `package.json` → Vitest; copy conventions from a neighboring `*.spec.ts`.
2. Boundary Value Analysis around the free-shipping threshold 100 → cases at 99 / 100 / 101; error guessing adds null, empty cart, negative quantity.
3. Run → all green.
4. Mutation: change `>= 100` to `> 100`; the 100 boundary test goes red with a clear message. Restore → green.
5. Suite run, output pasted in the summary. No hard waits, no invented data.

## Related artifacts

- the Superpowers `test-driven-development` skill - when the code does not exist yet.
- [`refactoring-shared-component-api`](../refactoring-shared-component-api/) - pairs here for wrapper/adapter mount tests.
- [`validating-features-end-to-end`](../validating-features-end-to-end/) - to turn a validated feature into an E2E spec.

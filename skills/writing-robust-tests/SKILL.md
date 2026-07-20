---
name: writing-robust-tests
description: Use when writing tests for existing code that lacks coverage - "write tests for X", "cover this file", "add tests", "écris des tests pour X", "couvre ce fichier", "ajoute des tests", code shipped without sufficient tests, flaky or fragile test suites to harden.
version: 1.0.1
metadata:
  last-reviewed: 2026-07-20
  category: test
---

# Writing Robust Tests - ISTQB design + evidence

> If the current repo has a dedicated test skill (e.g. acme-app → `write-tests`), it wins - it knows the golden dataset and the project commands.

## This skill vs. others

- **This skill**: the code exists, the tests are missing or fragile
- **superpowers:test-driven-development**: the code does not exist yet (test first)
- **detection-sweep**: a whole-project audit, not a targeted file

## Principle

**A green test you have never seen red proves nothing.** The output of this skill is not "tests written" but "tests whose failure has been demonstrated".

## 1. Adapt to the project (2 min, before writing)

- Framework + commands: read `package.json` scripts / `Cargo.toml` / `Makefile` / CI config
- **Read an existing neighboring test** and copy its conventions (page objects, helpers, fixtures) before inventing
- Data: locate the project's reference seed/fixtures; never invented magic data

## 2. Design (ISTQB, apply don't copy)

- **Level first**: unit (~70%) / integration-contract (~20%) / E2E (~10%). Choose deliberately - see the mock trap §4
- **Black-box**: Equivalence Partitioning · Boundary Value Analysis (threshold 100 → 99/100/101) · Decision Table · State Transition (an entity's lifecycle) · Use Case
- **Experience-based**: error guessing (null/empty/negative/Unicode/SQLi/XSS), regression checklist
- **FIRST**: Fast (unit without DB/network) · Isolated · Repeatable (no clock or random) · Self-validating · Timely

## 3. Absolute E2E rules (any Playwright/Cypress project)

1. **`data-testid` for every locator** - never `text=`, placeholder, CSS class, XPath. If the component has none: **adding the `data-testid`s to the component is part of the task**, not an excuse for a fragile locator
2. **Page Object**: locators / actions / assertions separated, scoped locators (`parent.getByTestId('child')`)
3. **ZERO hard waits** (`waitForTimeout`, `sleep`) - wait for a concrete state: visible, URL, network response
4. **Zero assertion coupled to the implementation's timing** (a toast that disappears after 3 s tested with a 5 s timeout = fragile coupling) - drive or neutralize the clock, or test the state not the duration
5. AAA, a single act, one concept per test ("and" in the name → split); no conditional `test.skip()`

## 4. The total-mock trap

Mocking the whole API in an "E2E" test makes it a UI component test: it will never detect a backend contract break. Choose explicitly:
- **True E2E**: real backend + seeded data - covers the contract
- **Component test**: mocked API - fast, but declare it as such and complete it with a contract test

Mock at the boundaries only (external network, clock), never in the middle of the system under test.

## 5. Mandatory evidence: the test can fail

For each test (or homogeneous group):
1. Run → green
2. **Temporarily break the code under test** (invert the condition, return a wrong value) → the test MUST go red with a readable message
3. Restore → green

A test that stays green with broken code is a Liar - rewrite it.

## Traps & rationalizations

| Excuse | Reality |
|--------|---------|
| "No time to run it, the test code is correct" | Tests never run = tests not written. Run them. |
| "getByRole/placeholder is more accessible" | And fragile at the slightest wording change. data-testid, full stop. |
| "The component has no data-testid" | Adding them is part of the task. |
| "I mock the API, it's more stable" | You just turned your E2E into a UI test. Decide the level deliberately. |
| "It's a one-line fix, no need to see red" | 30 seconds to mutate the code. Always. |

## Exit condition

- [ ] Project conventions reused (neighboring test read)
- [ ] data-testid added to the components touched, page object created/updated
- [ ] ZERO hard waits, zero fragile locator, zero timing coupling
- [ ] Each test seen red (mutation) then green
- [ ] Suite run, output pasted in the summary - never "it should pass"

## Tooling

- Advanced techniques (automated mutation testing, contract harness, fuzzing, quality gates): see `comprehensive-test-strategy/reference/testing-advanced.md` - shared with the strategy skill.

## Changelog

- 1.0.1 (2026-07-20) - Tooling now links the shared testing-advanced reference (was announced as planned while it already existed)

- 1.0.0 (2026-06-19) - initial versioned release + state-of-the-art enrichment (routing, context, protocol, traps, exit condition)

---
name: validating-features-end-to-end
description: Use when a feature is just implemented and tests pass, before closing a ticket or announcing it done - "is it good?", "does it work?", "ready to close the ticket?", "c'est bon ?", "est-ce que ça marche ?", "je peux fermer le ticket ?", green unit tests as only evidence.
version: 1.0.0
metadata:
  last-reviewed: 2026-06-19
  category: feature
---

# Functional validation of a feature - evidence before verdict

> If the current repo has a dedicated validation skill (e.g. acme-app → `feature-functional-validation`), it wins.

## This skill vs. others

- **This skill** when: feature implemented, tests green, before closing the ticket / announcing "done" - you must prove the intended behavior works in the real app
- **`adversarial-feature-challenge`** next: once it is proven to work, hunt for what breaks it
- **`commit-readiness-review`** instead if: the question is "is it committable" (secrets, lint, debug leftovers), not "does it work"

## Context to gather (before acting)

- The ticket/spec: golden path, explicit error cases, business rules - that is the list of invariants to validate
- Dev start command + the domain's E2E test command (`package.json` / `Makefile` / CI config)
- How to call the API directly (auth, base URL) and how to read the DB read-only
- If multi-tenant: 2 accounts from 2 distinct tenants to verify isolation

## Principle

- **"It compiles ≠ it works" and "green tests ≠ working feature"** - green unit tests on the formatter do not prove the button downloads a file
- **Evidence before assertion**: every ✅ in the report = an archivable artifact (screenshot, curl output, SQL query), never "it should work"
- **Strict scope**: validate THE requested feature, not audit the project
- Complementary to `adversarial-feature-challenge`: here you prove the intended behavior works; the challenge hunts for what breaks

## Workflow

1. **Actually start the app** (the project's dev command). No verdict without having exercised the feature in the running app.
2. **List the invariants** from the ticket/spec: golden path, explicit error cases, business rules. Validate **what the ticket asks for**, not what the code does.
3. **Golden path exercised with evidence**: preferably a dedicated E2E spec (page object, data-testid, zero hard waits) with a final screenshot; otherwise a driven manual walkthrough (Playwright MCP) + screenshot.
4. **Planned edge cases**: for each error case in the spec - 404/someone else's resource, insufficient rights, server validation, quota. **Multi-tenant: validate with 2 accounts from 2 tenants** (cross-tenant leakage is the #1 risk of exports/lists).
5. **Backend evidence**: direct API call (status, payload matching the contract, headers - e.g. `Content-Type`/`Content-Disposition` for an export) + read-only DB state.
6. **Adjacent non-regression**: run the E2E/test suite for the same functional domain - the feature must not break its neighbors.
7. **Re-read the assertions of the green tests**: a test with an over-permissive mock or an empty fixture passes without exercising anything. Green ≠ relevant.

## Report (mandatory, not optional)

```
Feature: <name> - Ticket: #<iid>
Golden path: ✅ (evidence: <screenshot path / output>)
Edge cases: <list with ✅/❌ and evidence for each>
Backend: API conforms ✅ · DB consistent ✅ (evidence)
Adjacent non-regression: <suites run + result>
Tenant isolation: ✅ (if applicable)
Verdict: ready for review | gap identified → <detail>
```

If a gap: **do not close the ticket** - document it in the tracker and return to implementation.

## Exit condition

- [ ] App started and feature actually exercised (not just the tests)
- [ ] Golden path proven by an archived artifact (screenshot / output)
- [ ] Each edge case in the spec: ✅/❌ + evidence
- [ ] Backend verified: API conforms to the contract + consistent DB state
- [ ] Tenant isolation proven with 2 accounts (if applicable)
- [ ] Adjacent-domain suites run and green
- [ ] Report filled with evidence - verdict given (never "it should work")

## Forbidden rationalizations

| Excuse | Reality |
|--------|---------|
| "The tests pass, it's fine" | Tests cover what they test. Did you see the feature work in the app? |
| "I checked by hand, no need to archive" | Without evidence, the report is worth an opinion. Screenshot/output or nothing. |
| "It's late, we'll check tomorrow" | 10 min tonight < an incident after the announcement. Verify the critical (tenant, golden path), defer the cosmetic. |
| "The report is bureaucracy" | It is what turns "I believe" into "I verified X, Y, Z". |

## Tooling

- Browser driving for UI evidence: Playwright MCP (`browser_navigate`, `browser_snapshot`, `browser_take_screenshot`) or the project's E2E runner
- Backend evidence: HTTP client on the CLI (status, headers, payload) + read-only DB access
- No dedicated script here: the commands (dev, E2E) are project-specific - read them from its config

## After

- Adversarial stress-test: `adversarial-feature-challenge`
- Bug found: `superpowers:systematic-debugging`, ticket via the repo's bug skill

## Changelog

- 1.0.0 (2026-06-19) - initial versioned release + state-of-the-art enrichment (routing, context, protocol, traps, exit condition)

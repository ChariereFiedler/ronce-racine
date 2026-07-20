# `validating-features-end-to-end`

> Green unit tests are not proof a feature works. Before closing the ticket, exercise it in the real running app and back every ✅ with an archivable artifact.

| | |
|---|---|
| **Type** | Skill (on-demand workflow) |
| **Category** | `feature` |
| **Artifact** | [`SKILL.md`](SKILL.md) |
| **Tooling** | None dedicated (project dev/E2E commands + Playwright MCP) |

## What it is

`validating-features-end-to-end` is the gate between "implemented, tests green" and "done, ticket closed". It requires you to start the actual application, exercise the feature the ticket describes, and produce a short report where every claim is backed by evidence - a screenshot, a curl output, a read-only SQL query.

## Why it exists

"It compiles" is not "it works", and "green tests" is not "working feature". Green unit tests on a formatter do not prove the button downloads a file; a passing test with an over-permissive mock or an empty fixture exercises nothing. The gap between green and working is exactly where features get announced and then break in front of users.

The most expensive version of that gap is **cross-tenant leakage** in exports and lists - the #1 risk for any multi-tenant feature, and one that only two accounts from two tenants can reveal. So the skill insists on evidence before assertion, strict scope (validate *this* feature, not audit the project), and a filled report that turns "I believe it works" into "I verified X, Y, Z".

## When it triggers

- a feature is just implemented and tests pass
- "is it good?" / "does it work?" / "can I close the ticket?"
- green unit tests offered as the only evidence

Use `commit-readiness-review` instead if the question is "is it committable" (secrets, lint, debug leftovers), and move to `adversarial-feature-challenge` *after* - once it is proven to work, to hunt for what breaks it.

## How it works

You start the real app, derive the invariants from the ticket (golden path, error cases, business rules), then exercise each one and back every claim with an archivable artifact - a screenshot, a curl output, a read-only SQL query. Coverage spans the golden path, the planned edge cases (with two accounts from two tenants for multi-tenant isolation), backend/DB evidence, adjacent-domain non-regression, and a re-read of the green tests' assertions. The run ends in a mandatory evidence-backed report with an explicit verdict; if a gap is found, you **do not close the ticket** - document it and return to implementation.

Full step-by-step protocol → [`SKILL.md`](SKILL.md).

## Worked example

> acme-app adds "export my invoices as CSV". Unit tests on the formatter are green.

1. Start the app; log in as tenant A and click Export → CSV downloads. Screenshot archived.
2. Edge case: log in as tenant B, call the export endpoint for tenant A's invoice id → expect 404/403. Verified with curl (status + body), output pasted.
3. Backend: `curl -i` shows `Content-Type: text/csv` and `Content-Disposition: attachment`; a read-only query confirms row count matches.
4. Run the billing E2E suite → green.
5. Report filled, verdict "ready for review".

## Related artifacts

- [`adversarial-feature-challenge`](../adversarial-feature-challenge/) - the next step: stress-test what breaks it.
- [`visual-regression-check`](../visual-regression-check/) - for the UI rendering side of a feature.
- [`writing-robust-tests`](../writing-robust-tests/) - to harden the E2E spec used as evidence.

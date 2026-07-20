# Rule - `test-discipline`

> Tests wait for state, not for the clock; select by intent, not by fragile markup; and every feature and bug ships with the tests that prove it.

| | |
|---|---|
| **Type** | Rule (path-scoped) |
| **Scope (`paths`)** | `**/*.spec.ts`, `**/*.test.ts` |
| **Version** | 1.0.0 |
| **Artifact** | [`rules/test-discipline.md`](../../rules/test-discipline.md) |
| **Paired skills** | [`writing-robust-tests`](../../skills/writing-robust-tests/), [`comprehensive-test-strategy`](../../skills/comprehensive-test-strategy/) |

## What it enforces

- **Zero `waitForTimeout`** - wait for a state/locator, never an arbitrary delay.
- **`data-testid` selectors only** - no bare `text=` nor fragile CSS selector.
- **Scoped locators** (`parent.getByTestId('child')`) - no ambiguous global locator.
- **Page objects** for E2E - no selectors scattered across specs.
- **FIRST** principles: Fast, Isolated, Repeatable, Self-validating, Timely.
- Every feature/fix → **UT + E2E + API** tests (deterministic golden dataset).
- Every bug → one UT + one E2E confirmation test written **with** the fix.

## Why it matters

Arbitrary sleeps are the number-one source of flaky E2E suites: too short and the test races the app, too long and the suite crawls - and either way the timeout says nothing about the actual condition you care about. Waiting for a state or locator makes the test both faster and deterministic.

Selecting by visible text or CSS couples the test to wording and styling that change for reasons unrelated to behavior, so refactors break green tests and teams learn to distrust the suite. A stable `data-testid` expresses *what* element matters, decoupled from *how* it looks. Scoping the locator and centralizing selectors in page objects keeps that intent unambiguous and maintainable as the UI grows.

Shipping the confirming tests **with** each feature and each fix is what makes coverage real: a bug that arrives with a failing-then-passing test can never silently regress again.

## How to apply it

### Wait for state, not time

```ts
// Bad - flaky and slow
await page.waitForTimeout(2000);
expect(await page.locator('.result').count()).toBe(1);

// Good - deterministic
await expect(page.getByTestId('result')).toBeVisible();
```

### Scoped, intent-based selectors via a page object

```ts
class OrdersPage {
  constructor(private page: Page) {}
  row(id: string) {
    return this.page.getByTestId(`order-row-${id}`);
  }
  status(id: string) {
    return this.row(id).getByTestId('status'); // scoped, not global
  }
}
```

### Bug → regression test with the fix

Write a unit test reproducing the bug and an E2E test reproducing the user flow, commit them alongside the fix so the pair proves the fix and guards against recurrence.

## Related

- [`writing-robust-tests`](../../skills/writing-robust-tests/) turns uncovered code into resilient tests.
- [`comprehensive-test-strategy`](../../skills/comprehensive-test-strategy/) plans the UT/E2E/API layering for a feature.
- Companion rule: [`detection-gap-protocol`](detection-gap-protocol.md) (the test that *would have* caught a user-found bug).

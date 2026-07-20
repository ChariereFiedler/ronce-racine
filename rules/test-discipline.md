---
paths:
  - "**/*.spec.ts"
  - "**/*.test.ts"
version: 1.0.0
metadata:
  last-reviewed: 2026-06-19
---

# Test discipline

- **Zero `waitForTimeout`** - wait for a state/locator, never an arbitrary delay
- **`data-testid` selectors only** - no bare `text=` nor fragile CSS selector
- **Scoped** locators (`parent.getByTestId('child')`), no ambiguous global locator
- **Page objects** for E2E - no selectors scattered across specs
- **FIRST** principles: Fast, Isolated, Repeatable, Self-validating, Timely
- Every feature/fix → **UT + E2E + API** tests (deterministic golden dataset)
- Every bug → one UT test + one E2E confirmation test written **with** the fix

<!-- Per-framework specifics (Angular/Jasmine, Vitest, Playwright config…): to go in a project rule, not here. -->

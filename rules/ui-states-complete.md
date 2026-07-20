---
paths:
  - "**/*.tsx"
  - "**/*.jsx"
  - "**/*.vue"
  - "**/*.svelte"
version: 1.0.0
metadata:
  last-reviewed: 2026-06-19
---

# UI states — all handled

Any view fed by an async operation handles all four states, each distinguishable (ideally a distinct `data-testid`):

- **loading**: visual feedback while waiting — never a frozen screen with no indication.
- **error**: actionable message + a retry action when possible — never a silent failure nor an infinite spinner.
- **empty**: explicit empty state (0 results) distinct from loading — not an ambiguous blank page.
- **success**: the nominal content.

- No view stuck on a perpetual spinner if the promise fails: the error must end the loading.
- States do not overlap (no "loading + error" shown together).
- Applies to any async building block: page, list, form submission, request-fed widget.

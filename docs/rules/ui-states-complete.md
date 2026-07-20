# Rule — `ui-states-complete`

> Every async view answers four questions — loading, error, empty, success — and never leaves the user staring at an ambiguous blank or an eternal spinner.

| | |
|---|---|
| **Type** | Rule (path-scoped) |
| **Scope (`paths`)** | `**/*.tsx`, `**/*.jsx`, `**/*.vue`, `**/*.svelte` |
| **Version** | 1.0.0 |
| **Artifact** | [`rules/ui-states-complete.md`](../../rules/ui-states-complete.md) |
| **Paired skills** | [`frontend-fullstack-implementation`](../../skills/frontend-fullstack-implementation/), [`design-system-component-lifecycle`](../../skills/design-system-component-lifecycle/) |

## What it enforces

Any view fed by an async operation handles all four states, each distinguishable (ideally a distinct `data-testid`):

- **loading**: visual feedback while waiting — never a frozen screen.
- **error**: actionable message + retry when possible — never a silent failure or an infinite spinner.
- **empty**: explicit "0 results" state, distinct from loading — not an ambiguous blank page.
- **success**: the nominal content.

Plus the invariants: a failed promise must **end** the loading state; states must not overlap (no "loading + error" together); and this applies to *any* async block — page, list, form submission, request-fed widget.

## Why it matters

The success path is the one developers naturally build; the other three are where real users spend a surprising amount of their time — on slow networks, on empty accounts, and when things fail. A view that only models success degrades badly at exactly those moments: a spinner that never resolves because the promise rejected, a blank page that could mean "loading", "no data", or "broken" with no way to tell, an error that vanishes silently and leaves the user stuck.

Treating the four states as a required set turns these from afterthoughts into designed behavior. Making each state distinguishable (a dedicated `data-testid`) also makes them **testable** — the E2E suite can assert that a failed request shows the error state and stops the spinner, closing the most common class of frontend "it just hangs" bugs.

## How to apply it

### Model the states explicitly

```tsx
function OrderList() {
  const { status, data, error, refetch } = useOrders();

  if (status === 'loading') return <Spinner data-testid="orders-loading" />;
  if (status === 'error')
    return <ErrorBox data-testid="orders-error" onRetry={refetch}>{error.message}</ErrorBox>;
  if (data.length === 0) return <Empty data-testid="orders-empty" />;
  return <ul data-testid="orders-success">{data.map(/* ... */)}</ul>;
}
```

Key points: the error branch ends the loading state and offers `retry`; `empty` is a separate branch from `loading`; each state carries its own `data-testid` so the four are never confused — by a user or by a test.

## Related

- [`frontend-fullstack-implementation`](../../skills/frontend-fullstack-implementation/) builds views that satisfy this contract.
- [`design-system-component-lifecycle`](../../skills/design-system-component-lifecycle/) standardizes the four-state components.
- Companion rule: [`subscription-cleanup`](subscription-cleanup.md) (the other half of robust async UI).

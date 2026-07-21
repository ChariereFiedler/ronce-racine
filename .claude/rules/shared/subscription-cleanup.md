---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
  - "**/*.vue"
version: 1.0.0
metadata:
  last-reviewed: 2026-06-19
---

# Subscription cleanup

Any resource that "subscribes" or registers must have an explicit teardown - otherwise memory leaks, ghost handlers, double execution.

- **Observables / streams**: `unsubscribe()`, a completion operator (`takeUntil(destroy$)`, `takeUntilDestroyed()`, `take(1)`), or the `async` pipe / a binding with managed lifecycle. Never a bare `.subscribe(` without one of these.
- **Listeners**: every `addEventListener` / `on(...)` has a matching removal (`removeEventListener` / `off(...)`) on teardown.
- **Timers**: every recurring `setInterval` / `setTimeout` is cancelled (`clearInterval` / `clearTimeout`).
- **Watchers / reactive effects**: keep the handle and stop it, or use a self-managing lifecycle API (`watchEffect`, effect scope).
- **Cancellable requests / streams**: `AbortController` aborted on teardown or dependency change.
- Cleanup lives in the end-of-life hook (`onUnmounted`, `ngOnDestroy`, `useEffect` cleanup, `Drop`…), never "later".

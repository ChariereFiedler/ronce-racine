# Rule — `subscription-cleanup`

> Anything that subscribes or registers must have a matching teardown — or it leaks memory, fires ghost handlers, and runs twice.

| | |
|---|---|
| **Type** | Rule (path-scoped) |
| **Scope (`paths`)** | `**/*.ts`, `**/*.tsx`, `**/*.js`, `**/*.jsx`, `**/*.vue` |
| **Version** | 1.0.0 |
| **Artifact** | [`rules/subscription-cleanup.md`](../../rules/subscription-cleanup.md) |
| **Paired skill** | [`refactoring-shared-component-api`](../../skills/refactoring-shared-component-api/) |

## What it enforces

Every resource that subscribes or registers is explicitly torn down:

- **Observables / streams**: `unsubscribe()`, a completion operator (`takeUntil(destroy$)`, `takeUntilDestroyed()`, `take(1)`), or the `async` pipe / lifecycle-managed binding. Never a bare `.subscribe(`.
- **Listeners**: every `addEventListener` / `on(...)` has a matching `removeEventListener` / `off(...)` on teardown.
- **Timers**: every recurring `setInterval` / `setTimeout` is cancelled.
- **Watchers / reactive effects**: keep the handle and stop it, or use a self-managing lifecycle API (`watchEffect`, effect scope).
- **Cancellable requests**: `AbortController` aborted on teardown or dependency change.
- Cleanup lives in the end-of-life hook (`onUnmounted`, `ngOnDestroy`, `useEffect` cleanup, `Drop`…), never "later".

## Why it matters

A subscription without teardown is a slow-motion outage. Each time a component mounts, it registers another listener or stream; when it unmounts without cleanup, that registration survives — holding references (a memory leak) and still reacting to events (a ghost handler). Navigate back and forth a few times and the same callback fires three, five, ten times, causing duplicated network calls, doubled state updates, and bugs that only appear after a while and are miserable to reproduce.

Binding cleanup to the component's own lifecycle hook makes teardown deterministic: it happens exactly when the thing that created the subscription goes away, not on a hopeful "later" that never comes. This is the single most common source of leaks in long-lived SPA sessions.

## How to apply it

### Never a bare subscribe

```ts
// Bad — leaks on every re-render / re-navigation
source$.subscribe((v) => this.value = v);

// Good — completes with the component
source$.pipe(takeUntilDestroyed()).subscribe((v) => this.value = v);
```

### Match every registration

```ts
// React
useEffect(() => {
  const onResize = () => measure();
  window.addEventListener('resize', onResize);
  const id = setInterval(poll, 5000);
  const ctrl = new AbortController();
  fetch(url, { signal: ctrl.signal });
  return () => {
    window.removeEventListener('resize', onResize);
    clearInterval(id);
    ctrl.abort();
  };
}, []);
```

## Related

- [`refactoring-shared-component-api`](../../skills/refactoring-shared-component-api/) — when reworking a shared component, audit its teardown paths.
- Companion rule: [`ui-states-complete`](ui-states-complete.md) (the other half of robust async UI).

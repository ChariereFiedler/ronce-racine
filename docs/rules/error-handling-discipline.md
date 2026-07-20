# Rule - `error-handling-discipline`

> No error is ever swallowed and no fallible call ever crashes production. Every failure is either propagated or handled - explicitly, with context.

| | |
|---|---|
| **Type** | Rule (path-scoped) |
| **Scope (`paths`)** | `**/*.ts`, `**/*.tsx`, `**/*.js`, `**/*.vue`, `**/*.py`, `**/*.go`, `**/*.rs`, `**/*.php`, `**/*.java` |
| **Version** | 1.0.0 |
| **Artifact** | [`rules/error-handling-discipline.md`](../../rules/error-handling-discipline.md) |
| **Paired rule** | [`secure-logging`](secure-logging.md) |

## What it enforces

Disciplined failure handling across every backend and frontend language in scope:

- **No swallowed error**: no empty `catch {}`, no log-and-continue as if nothing happened, no `except: pass`, no ignored `_ = err`.
- **No crash on a fallible op in prod**: no `unwrap()` / `expect()` / `panic!`, no unguaranteed `!!` / `!`, no forced cast on a value that can fail - return or propagate a typed error. (Tolerated in tests.)
- **Propagate or handle - pick one**: surface it (`Result` / `throw` / `raise`) or deal with it (fallback, bounded retry, user message). Never in between.
- **Enrich context before propagating**: which operation, which non-sensitive identifier - not a bare message.
- **Distinguish expected vs unexpected**: business errors handled locally; unexpected ones bubble to a boundary that decides and alerts.

## Why it matters

A swallowed error is the most expensive kind of bug: the system keeps running on corrupt state, and the failure surfaces far from its cause - often as a mysterious downstream symptom that costs hours to trace. A `.unwrap()` on a value that can be absent turns a recoverable condition into a full crash.

The middle ground - logging an error and continuing anyway - is the worst of both: you neither recover cleanly nor stop the damage. Forcing an **explicit** choice between propagating and handling makes the failure path a designed part of the code, not an afterthought. Enriching context at each boundary means the log line that finally reaches you says *which operation on which entity failed*, turning a debugging session into a glance.

## How to apply it

### Swallowing vs propagating

```ts
// Bad - swallowed, state now inconsistent
try { await save(order); } catch (e) { console.log(e); }

// Good - enrich and propagate
try {
  await save(order);
} catch (cause) {
  throw new Error(`persisting order ${order.id} failed`, { cause });
}
```

### Fallible operations in Rust

```rust
// Bad - crashes prod if the row is missing
let user = repo.find(id).unwrap();

// Good - propagate a typed error
let user = repo.find(id)?;
```

### Expected vs unexpected

Handle an expected business error (e.g. "email already taken") right where the use case can react. Let an unexpected error (DB down, invariant violated) bubble to a boundary - an HTTP error handler, a job supervisor - that maps it to a response and alerts.

## Related

- [`secure-logging`](secure-logging.md) - enrich context with **non-sensitive** identifiers only; never log the payload.
- Companion rule: [`clean-architecture-deps`](clean-architecture-deps.md) - errors cross layer boundaries as typed values.

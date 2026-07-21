---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.vue"
  - "**/*.py"
  - "**/*.go"
  - "**/*.rs"
  - "**/*.php"
  - "**/*.java"
version: 1.0.0
metadata:
  last-reviewed: 2026-06-19
---

# Error handling - no silent failure

- **Never swallow an error**: no empty `catch {}`, no `catch` that logs and carries on as if nothing happened, no `except: pass`, no ignored `_ = err`.
- **No crash on a fallible operation in prod**: no `unwrap()`/`expect()`/`panic!` (Rust), no unguaranteed `!!`/`!`, no forced cast on a value that can fail - return/propagate a typed error. (Tolerated in tests.)
- **Propagate or handle - choose explicitly**: either surface the error (`Result`/`throw`/`raise`), or deal with it (fallback, bounded retry, user message). Never something in between.
- **Enrich the context before propagating**: which operation, which non-sensitive identifier (see [`secure-logging`](secure-logging.md)) - not a bare message.
- **Distinguish expected / unexpected**: an expected business error is handled locally; an unexpected one bubbles up to a boundary that decides (and alerts).

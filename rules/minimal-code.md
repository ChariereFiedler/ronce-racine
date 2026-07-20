---
paths:
  - "**/*.rs"
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.vue"
  - "**/*.py"
  - "**/*.go"
version: 1.0.0
metadata:
  last-reviewed: 2026-06-19
---

# Less code, not fewer lines

The best code is the code you don't write. Before adding code, go down the hierarchy and stop at the first level that meets the need:

1. **Is the need real?** No speculation (YAGNI). Only code what is asked for or proven necessary.
2. **Does the stdlib / the language already do it?** (iterators, native collection methods, framework helpers.)
3. **Does an already-installed dependency do it?** Check the manifest (`Cargo.toml`, `package.json`, `go.mod`…) before adding a lib or reimplementing.
4. **Does a component / module / function already in the project do it?** Reuse before duplicating.
5. **Otherwise, write the simplest solution** that covers the case - and only that case.

## Guardrail: readability > brevity

Minimizing code **does not mean minimizing lines**. A "shortest line" goal produces unreadable, unmaintainable code - that is a failure, not a success.

- **Forbidden**: cryptic one-liners, nested operator chains, obscure abbreviations, removing intermediate names just to "save a line".
- **Preferred**: a well-named intermediate variable over a dense expression; an early return over a nested ternary; splitting into short named functions stays the priority.
- The right instinct is to **delete superfluous code** (premature abstractions, needless indirection, empty wrappers, never-used options), not to **compress useful code**.

> Arbitration rule: if the shortest code is less clear than slightly longer code, choose the clearer one. The target is *less surface to maintain*, not *fewer characters*.

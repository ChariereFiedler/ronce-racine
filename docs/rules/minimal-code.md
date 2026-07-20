# Rule - `minimal-code`

> The best code is the code you don't write - but "less code" means less surface to maintain, never fewer characters at the cost of clarity.

| | |
|---|---|
| **Type** | Rule (path-scoped) |
| **Scope (`paths`)** | `**/*.rs`, `**/*.ts`, `**/*.tsx`, `**/*.vue`, `**/*.py`, `**/*.go` |
| **Version** | 1.0.0 |
| **Artifact** | [`rules/minimal-code.md`](../../rules/minimal-code.md) |

## What it enforces

Before adding code, walk down a hierarchy and stop at the first level that meets the need:

1. **Is the need real?** No speculation (YAGNI) - code only what is asked or proven necessary.
2. **Does the stdlib / language already do it?**
3. **Does an already-installed dependency do it?** Check the manifest before adding a lib or reimplementing.
4. **Does an existing component / module / function in the project do it?** Reuse before duplicating.
5. **Otherwise, write the simplest solution** that covers exactly the case at hand.

And a hard guardrail: **readability beats brevity**. Minimizing code is not minimizing lines. Cryptic one-liners, nested operator chains, and stripped-out intermediate names are failures, not wins.

## Why it matters

Every line is a liability: it must be read, tested, reviewed, and maintained forever. Code you avoid writing - because the stdlib, a dependency, or an existing helper already covers it - has zero maintenance cost and zero bug surface. Speculative generality (the "we might need it later" abstraction) is pure cost against a benefit that usually never arrives.

But the goal is often misread as "shortest code wins", which produces dense, unreadable expressions that are *harder* to maintain than the verbose version - the opposite of the intent. The rule draws the line explicitly: delete **superfluous** code (premature abstractions, empty wrappers, unused options), never **compress useful** code. A well-named intermediate variable and an early return are worth more than a saved line.

## How to apply it

### Reuse before reimplementing

```ts
// Before writing a dedupe loop - the language already does it
const unique = [...new Set(items)];

// Before adding a date lib - check package.json for one already present
```

### Delete surface, don't compress it

```ts
// Bad - "one line" at the cost of readability
const r = xs.filter(x=>x.a&&x.b).map(x=>x.a*x.b).reduce((s,v)=>s+v,0)||0;

// Good - same behavior, named steps, early clarity
const eligible = xs.filter((x) => x.a && x.b);
const products = eligible.map((x) => x.a * x.b);
const total = products.reduce((sum, v) => sum + v, 0);
```

> Arbitration rule: if the shortest code is less clear than slightly longer code, choose the clearer one. The target is *less surface to maintain*, not *fewer characters*.

## Related

- Companion rule: [`clean-architecture-deps`](clean-architecture-deps.md) - reuse across layers instead of duplicating logic.
- Companion rule: [`error-handling-discipline`](error-handling-discipline.md) - the simplest solution still handles failure explicitly.

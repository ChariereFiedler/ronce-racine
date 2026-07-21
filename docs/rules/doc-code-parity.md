# Rule - `doc-code-parity`

> A command shown in the documentation is executed before it is committed, and a behavior change greps the docs in the same commit.

| | |
|---|---|
| **Type** | Rule (scoped to Markdown) |
| **Scope (`paths`)** | `**/README.md`, `**/docs/**/*.md` |
| **Version** | 1.0.0 |
| **Artifact** | [`rules/doc-code-parity.md`](../../rules/doc-code-parity.md) |
| **Enforced by** | `tools/skills.ts docs`, wired into `npm test` |

## What it enforces

- Commands appearing in docs are run before commit
- A behavior change sweeps the docs in the same commit
- Documentation that ships to a user's repository is treated as code
- Requirements are stated per component, never as one global promise
- Verifiable claims become harness checks instead of trusted prose

## Why it matters

This rule exists because two documentation defects reached published users. `hooks/README.md`, which the installer copies into every adopting repository, still instructed readers to wire hooks with `npx tsx .../hook.ts` after the installer had moved to `node .../hook.mjs`. And the README promised "the target repo needs only Node" while the optional detection scripts still shipped as TypeScript requiring `tsx`.

Neither was caught by tests, typecheck or review. Both described a past state of the code confidently enough that a reader would follow them and fail. The lesson is not "write better docs": it is that any doc claim reducible to a fact about the code belongs in the harness, and the rest belongs in a habit of running what you write.

## How it is checked

`tools/skills.ts docs` compares documentation against the installer itself: wiring examples must match the command shape the installer generates, every hook must be documented and no phantom one may be, a "only Node" claim must not coexist with shipped TypeScript, and any documented `npx tsx <path>` must name a file that exists.

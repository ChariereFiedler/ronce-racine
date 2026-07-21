---
paths:
  - "**/README.md"
  - "**/docs/**/*.md"
version: 1.0.0
metadata:
  last-reviewed: 2026-07-21
---

# Documentation must match the code it describes

- **A command shown in a doc is executed, not imagined.** Before committing a doc that contains a command, run it. A wiring snippet, an install line or a CLI invocation that no longer matches the code is worse than no example: the reader trusts it.
- **When behavior changes, grep the docs in the same commit.** Renaming a file, changing what a generator emits, or changing a runtime requirement invalidates every doc that quoted it. Search for the old form before declaring the change done.
- **Documentation that ships to users is code.** A file copied into someone else's repository (here: `hooks/README.md`) describes what runs on their machine. Treat a stale claim in it as a defect, not as cosmetics.
- **State requirements per component, not globally.** "This needs only Node" is false the moment one optional part needs more. Say which part needs what.
- **Prefer a mechanical check over a promise.** Where a doc claim can be verified against the source of truth, add it to the harness (`tools/skills.ts docs`) rather than relying on review to notice.

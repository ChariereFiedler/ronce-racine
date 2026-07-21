# API migration - <Component>: `<old>` → `<new>`

## Sweep (paste the output of sweep-call-sites.ts here)

- [ ] <file> - migrated / removed / not affected (justification)

## Checks

- [ ] Grep of the old name = **0 occurrences** among consumers
- [ ] Silent-contract: every prop passed by every call site is declared in the component's interface (manual if no strictTemplates)
- [ ] Every wrapper/adapter touched has its **mount unit test** (event bubbles up, prop drives the render)
- [ ] Existing tests assert the **new** name (not a CSS class that would pass anyway)
- [ ] Typecheck + unit tests green

## MR deliverable

| Call site | Status | Justification if not migrated |
|---|---|---|
| | | |

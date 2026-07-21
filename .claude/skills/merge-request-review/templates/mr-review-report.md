# Review - <MR/PR #id or branch>

**Target**: `<target-branch>` ← **Source**: `<source-branch>`
**Ticket**: <id / link> - <what the change should do>
**Pipeline / CI**: <green / red / running - jobs looked at>

## Verdict

> **APPROVE** | **REQUEST CHANGES**

## Blocking points

- [ ] <file:line - problem - expected fix>

## Minor points (non-blocking)

- <file:line - suggestion>

## Checklist

- [ ] CI green (jobs verified)
- [ ] No debug leftovers
- [ ] No hard-coded waits in tests
- [ ] Contract / API respected
- [ ] i18n OK
- [ ] No sensitive files
- [ ] No unjustified disabled tests
- [ ] No conflict with the target
- [ ] Diff matches the ticket, nothing out of scope

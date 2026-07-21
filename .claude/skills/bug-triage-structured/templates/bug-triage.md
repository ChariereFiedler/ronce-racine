# [Bug] <short title - symptom, not solution>

## Reproduction
**Observed**: <observed behavior>
**Expected**: <correct behavior>
**Where**: <page / endpoint / module>
**Since when**: <commit, version, date - or unknown>
**Minimal repro**: <initial state · action · result - exact steps>
**Status**: deterministic / intermittent (suspected conditions: <…>)

## Root-cause analysis
**Code access**: yes / no - if no, cause `to investigate`, do not disguise a design hypothesis as a root cause.

**Mechanism**: <what actually happens - NOT the symptom>
**Cited code**: `file:line` - <the faulty code or the missing guard>
**Introducing commit**: `hash` (<date>) - <context>
**Hypothesis status**: confirmed / strong / to validate / to investigate
**Why the existing tests didn't catch the bug**: <honest answer>

## Decision
**Outcome**: fix now / ticket
**Justification**: <cause status · size and risk of the fix · session scope and priority>

## Confirmation test
| Type | Target file | Key assertion | Before fix | After fix |
|---|---|---|---|---|
| UT | | | ❌ FAIL | ✅ PASS |
| E2E | | | ❌ FAIL | ✅ PASS |

> Each test MUST fail before the fix and pass after.
> If decision = fix: paste the red-then-green outputs.
> If decision = ticket: fill the table, do not code the fix.

## Priority
<critical: prod down, data loss, exploitable flaw · high: broken with no workaround · medium: workaround possible · low: cosmetic> - <justification>

## Recurrence
<Section present only if the scope has 2+ recent fixes - see the recurring-bug-root-cause skill.>

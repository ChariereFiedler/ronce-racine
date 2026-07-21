# [Bug] <short title - symptom, not solution>

## Context
**Observed**: <observed behavior>
**Expected**: <correct behavior>
**Where**: <page / endpoint / module>
**Since when**: <commit, version, date - or unknown>
**Reproducibility**: <systematic / intermittent / conditions>
**User impact**: <who, how often, workaround possible?>

## Root-cause analysis
**Code access**: yes / no - if no, cause `to investigate`, do not disguise a design hypothesis as a root cause.

**Mechanism**: <what actually happens - NOT the symptom>
**Cited code**: `file:line` - <the faulty code or the missing guard>
**Introducing commit**: `hash` (<date>) - <context>
**Hypothesis status**: confirmed / strong / to validate / to investigate
**Why the existing tests didn't catch the bug**: <honest answer>

## Reproduction scenarios

### Scenario 1: reproduce the bug (fails today)
**Given** <state> **When** <action> **Then** <the bug>

### Scenario 2: nominal behavior post-fix
**Given** <same state> **When** <same action> **Then** <expected behavior>

### Scenario 3: related edge case
<back navigation, multi-tab, boundary data…>

## Required confirmation tests
| Type | Target file | Key assertion | Before fix | After fix |
|---|---|---|---|---|
| UT | | | ❌ FAIL | ✅ PASS |
| E2E | | | ❌ FAIL | ✅ PASS |

> Each test MUST fail before the fix and pass after. A fix with no confirmation test is incomplete.

## Priority
<critical: prod down, data loss, exploitable flaw · high: broken with no workaround · medium: workaround possible · low: cosmetic> - <justification>

## Recurrence
<Section present only if the scope has 2+ recent fixes - see the recurring-bug-root-cause skill.>

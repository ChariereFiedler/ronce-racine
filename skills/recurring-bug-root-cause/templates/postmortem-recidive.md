# Recurrence <scope> - <YYYY-MM-DD>

## Timeline
| Date | Commit | Symptom fixed |
|---|---|---|
| | | |

## Bug class
<One sentence describing the common property of the N fixes - the implicit contract violated, the missing guardrail, the environment divergence. Not the symptoms.>

## Tested hypotheses
| Hypothesis | Test performed | Status | Evidence |
|---|---|---|---|
| <candidate cause> | | confirmed / refuted | |
| Existing tooling should have caught it | why didn't it? | | |
| Isolated slip of attention | ≥ 2 independent occurrences? | usually refuted | |

> A postmortem with no **refuted** hypothesis = narrative, not a spike.

## Root cause
<The confirmed mechanism, numbered factors if several.>

## Tooled guardrail
- Blocking mechanism: <custom lint / compiler option / class test / hook / CI check>
- Sweep of existing code: <N errors raised → tickets or annotated exceptions>

## Regression tests
| Test | Covers | Was failing on the N bugs before the fix? |
|---|---|---|
| | occurrence #1 / whole class | |

## Follow-up actions
| Action | Ticket | Due |
|---|---|---|
| | <real iid, never "to create"> | |

## What we learned

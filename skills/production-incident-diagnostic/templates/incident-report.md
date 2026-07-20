# Incident report — <short summary>

## Summary
- **Scope**: <everything / endpoint / feature / subset of users>
- **First detected**: <timestamp>
- **Detected by**: <alert / user report / monitoring>
- **Status**: <ongoing | mitigated | resolved | escalated>

## Faulty layer
<hosting/deployment | backend/API | alerting | frontend | data>

## Timeline
| Time | Event |
|------|-------|
| <ts> | <symptom observed> |
| <ts> | <diagnostic action> |
| <ts> | <mitigation applied> |

## Evidence
- <log excerpt>
- <metric / dashboard capture>
- <trace / query result>
- <reproduction command + output>

## Root cause
<hypothesis supported by the evidence above — no unproven speculation>

## Mitigation
- <rollback / forward-fix / confirmed restart / confirmed purge>

## Follow-up
- [ ] <hardening action> — ticket #<iid>
- [ ] <missing observability to add if the incident did not alert> — ticket #<iid>

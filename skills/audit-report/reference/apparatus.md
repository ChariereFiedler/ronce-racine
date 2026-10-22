# Audit apparatus - shared by the domain audits

The parts of a domain audit report that do not depend on the domain: how the
score is computed, what criticality and confidence mean, how unverifiable
items are handled, and the shape of the report. A domain skill (`audit-*`)
points here instead of restating them; its own file keeps what is specific to
its questions (codes, sub-question rules, N/A variants, exit condition).

## Score calculation

- Domain score = average of the scored questions (exclude N/A)
- State "X questions scored out of Y total"
- A question is N/A if the project profile makes it non-applicable (see the skill's variants by project type)
- Criticality is used to prioritize remediation, NOT in the score - see `scoring-model.md` in this directory

## Criticality levels

- **must**: fundamental practice, absence = critical risk
- **should**: good practice, absence = moderate risk
- **could**: excellence, absence = room for improvement

## Confidence levels

- **high**: verified by an executed command or direct file read
- **medium**: inferred from structure/config but not deeply verified
- **low**: requires an interview or external access (coverage dashboard, historical reports, team interview)

## Non-auditable items

Anything impossible to verify by static analysis (runtime config, external
WAF, pentest results, coverage dashboard, historical reports, team interview)
is listed under `### Non-auditable items`, never silently skipped: one line
per item, with the question code and the reason (requires interview /
dashboard access / log access / field observation / ...).

## Output format

```markdown
## <Domain> - Overall score: X.X/4 (Y questions scored out of Z)

### Summary
[2-3 sentences summarizing the domain maturity]

### Detail by question

| Code | Question | Criticality | Level | Confidence | Justification |
|------|----------|-------------|-------|------------|---------------|
| <code> | <question statement> | must/should/could | X | high/medium/low | ... |

### Strengths
- ...

### Weaknesses
- ...

### Recommendations
1. [MUST] ...
2. [SHOULD] ...
3. [COULD] ...

### Non-auditable items
- [<code>] Description - Reason (requires interview / dashboard access / log access / field observation / ...)
```

One row per question of the domain, in the order of the grids; N/A questions
keep their row with `N/A` as the level and the reason as justification.

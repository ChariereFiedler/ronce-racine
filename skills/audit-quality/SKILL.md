---
name: audit-quality
description: QA & DevOps + Data quality audit. Use when auditing test coverage, CI/CD quality, code quality, dependency security, observability, data validation, data lifecycle, or error handling. Triggers on "audit qualité", "audit quality", "audit code", "code audit", "audit données", "data audit", "audit QA", "QA audit", "audit devops", "devops audit".
version: 1.0.1
metadata:
  last-reviewed: 2026-07-20
  category: audit
---

## When ME and not audit-industrialisation

- **ME** when: an audit targeting this domain only
- **audit-industrialisation** instead if: a global multi-domain audit - it orchestrates every audit (including ME) and produces a consolidated report

> For a full project audit, use `audit-industrialisation` rather than invoking each skill separately.

---

# QA & DevOps + Data Quality Audit

## Overview

Audit a project's maturity across two sections (**28 questions**), scored 0-4 per question:

- **QA & DevOps** (16 questions): test coverage, CI/CD, code quality, dependency security, observability, code review, DORA metrics - grid in [reference/qa-devops.md](reference/qa-devops.md)
- **QU - Data quality** (12 questions): schema validation, null handling, business consistency, anomaly correction, traceability, data lifetime - grid in [reference/qu-qualite-donnees.md](reference/qu-qualite-donnees.md)

## Score calculation

- Domain score = average of ALL scored questions across both sections (flat mean, exclude N/A - per `audit-report/reference/scoring-model.md`; do NOT average the two section means)
- Section means may be shown for readability, but they do not enter the domain score
- State "X questions scored out of Y total" per section
- A question is N/A if the project profile makes it non-applicable

## Audit protocol

1. **Identify the project type**: backend, frontend SPA, fullstack, library, microservices. Mark questions N/A according to the context.
2. **QA & DevOps section**: read [reference/qa-devops.md](reference/qa-devops.md). For each question QA-01 to QA-14, run the listed bash commands, assign a level 0-4 (or N/A) with a justification and a confidence.
3. **QU - Data quality section**: read [reference/qu-qualite-donnees.md](reference/qu-qualite-donnees.md). For each question QU-01 to QU-09a, run the listed bash commands, assign a level 0-4 (or N/A) with a justification and a confidence.
4. **Calculate the scores** according to the rules above.
5. **Produce the report** in the output format below.

## Grids by section

| Section | Grid | Questions |
|---------|------|-----------|
| QA & DevOps | [reference/qa-devops.md](reference/qa-devops.md) - tests, CI/CD, code quality, security, observability, DORA | 16 |
| QU - Data quality | [reference/qu-qualite-donnees.md](reference/qu-qualite-donnees.md) - validation, consistency, anomalies, traceability, lifecycle | 12 |

Each grid contains, per question: statement, criticality (must/should/could), items to analyze and check, bash commands, and the table of levels 0-4.

## Output format

```markdown
## QA & DevOps + Data Quality - Global score: X.X/4

### Summary
[2-3 sentences summarizing quality maturity across the two sections]

### QA & DevOps section - Score: X.X/4 (Y questions scored out of 16)

| Code | Question | Criticality | Level | Confidence | Justification |
|------|----------|-------------|-------|------------|---------------|
| QA-01 | Test coverage | must | X | high/medium/low | ... |
| QA-01a | Test strategy by criticality | should | X | high/medium/low | ... |
| QA-02 | Post-deployment smoke tests | must | X | high/medium/low | ... |
| QA-03 | Single artifact promotion | should | X | high/medium/low | ... |
| QA-04 | CI/CD quality gates | must | X | high/medium/low | ... |
| QA-05 | CI/CD feedback speed | should | X | high/medium/low | ... |
| QA-06 | Code quality & debt | should | X | high/medium/low | ... |
| QA-07 | Dependency security (SCA) | must | X | high/medium/low | ... |
| QA-07a | Dependency updates | should | X | high/medium/low | ... |
| QA-08 | Incident reproducibility | should | X | high/medium/low | ... |
| QA-09 | Realistic datasets | should | X | high/medium/low | ... |
| QA-10 | Application profiling | could | X | high/medium/low | ... |
| QA-11 | CI/CD security | must | X | high/medium/low | ... |
| QA-12 | Product observability | should | X | high/medium/low | ... |
| QA-13 | Code review | must | X | high/medium/low | ... |
| QA-14 | DORA metrics | should | X | high/medium/low | ... |

### QU Data Quality section - Score: X.X/4 (Y questions scored out of 12)

| Code | Question | Criticality | Level | Confidence | Justification |
|------|----------|-------------|-------|------------|---------------|
| QU-01 | Input schema validation | must | X | high/medium/low | ... |
| QU-01a | Validation errors | should | X | high/medium/low | ... |
| QU-02 | Null/incomplete handling | should | X | high/medium/low | ... |
| QU-03 | Business consistency | must | X | high/medium/low | ... |
| QU-03a | Data anomaly detection | could | X | high/medium/low | ... |
| QU-04 | Manual anomaly correction | should | X | high/medium/low | ... |
| QU-05 | Automatic anomaly correction | could | X | high/medium/low | ... |
| QU-06 | Correlation ID (traceId) | should | X | high/medium/low | ... |
| QU-07 | Technical logs / business events separation | should | X | high/medium/low | ... |
| QU-08 | Data lifetime | must | X | high/medium/low | ... |
| QU-09 | Automatic purges | should | X | high/medium/low | ... |
| QU-09a | Purge verification | could | X | high/medium/low | ... |

### Strengths
- ...

### Weaknesses
- ...

### Recommendations
1. [MUST] ...
2. [SHOULD] ...
3. [COULD] ...

### Non-auditable items
- [List here any item impossible to verify by static analysis: runtime metrics, real performance, etc.]
```

## Exit condition

- [ ] Project type identified, N/A questions marked
- [ ] The 16 QA questions scored 0-4 or N/A, with justification and confidence
- [ ] The 12 QU questions scored 0-4 or N/A, with justification and confidence
- [ ] Verification commands executed for every scored question
- [ ] Section scores and global score calculated (N/A excluded)
- [ ] Report produced in the output format

## Changelog

- 1.0.1 (2026-07-20) - scoring aligned with scoring-model.md: flat mean only; criticality kept for remediation priority, weights removed from the score

- 1.0.0 (2026-06-19) - initial versioned release + state-of-the-art enrichment (routing, context, protocol, traps, exit condition); audit grids in reference/ (progressive disclosure)

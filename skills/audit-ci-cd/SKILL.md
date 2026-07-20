---
name: audit-ci-cd
description: Audit CI/CD & Release Management. Use when auditing pipelines, deployment strategies, DORA metrics, IaC, artifact management, or supply chain security. Triggers on "audit ci", "audit pipeline", "audit déploiement", "audit deployment", "audit release".
version: 1.0.0
metadata:
  last-reviewed: 2026-06-19
  category: audit
---

# Audit CI/CD & Release Management

## When ME and not audit-industrialisation

- **ME** when: an audit scoped to this domain only
- **audit-industrialisation** instead if: a global multi-domain audit — it orchestrates every audit (including ME) and produces a consolidated report

> For a full project audit, use `audit-industrialisation` rather than invoking each skill separately.

## Overview

Audit a project's CI/CD maturity by analyzing pipelines, deployment strategies, DORA metrics, environment management, Infrastructure as Code, artifact management, rollback procedures, and software supply chain security. Produces a maturity score (0-4) per question and prioritized recommendations.

**10 questions** spread across 6 sections. The detailed grids (statement, analysis, checks, commands, levels 0-4) live in `reference/` — see [Grids by section](#grids-by-section).

Criticality levels:
- **must**: fundamental practice, absence = critical risk
- **should**: good practice, absence = moderate risk
- **could**: excellence, absence = room for improvement

## Score calculation

- Domain score = average of scored questions (exclude N/A)
- State "X questions scored out of Y total"
- A question is N/A if the project profile makes it non-applicable (e.g. a library with no deployment → ci-02/ci-06/ci-09 N/A)
- Intra-domain weighting by criticality:
  - **must** (weight 3): ci-01, ci-02, ci-06, ci-09
  - **should** (weight 2): ci-07, ci-08, ci-10
  - **could** (weight 1): ci-03, ci-04, ci-05
- Weighted score = sum(level × weight) / sum(weight) of scored questions

## Audit protocol

1. **Detect the CI system**: run the ci-01 commands to find the pipeline files
2. **Read every pipeline file** found
3. **Run the verification commands** for each question ci-01 to ci-10
4. **Analyze each question** based on the command output and the file reading
5. **Look for deployment configs**: Dockerfile, docker-compose, Helm, Terraform, etc.
6. **Check the npm scripts in `package.json`** for deploy, release, etc. commands
7. **Evaluate the DORA metrics** (ci-03, ci-04, ci-05): these questions often require interviews or dashboard access for a high-confidence assessment
8. **Assign a level** (0-4) per question with justification and confidence level
9. **Mark N/A** the questions non-applicable to the project profile (e.g. no deployment → ci-02 N/A)
10. **List the non-auditable items** requiring an interview or external access
11. **Produce the report** in the standard format (see below)

Confidence levels:
- **high**: verified by an executed command or direct file reading
- **medium**: inferred from the structure/config but not verified in depth
- **low**: requires an interview or external access (CI logs, dashboard, team interview)

## Grids by section

Each file contains the statement, the items to analyze/check, the bash commands, and the level 0-4 tables.

| Section | Reference | Questions | Count |
|---------|-----------|-----------|-------|
| CI Pipeline | [reference/pipeline-ci.md](reference/pipeline-ci.md) | ci-01 | 1 |
| Deployment & Environments | [reference/deploiement.md](reference/deploiement.md) | ci-02, ci-06, ci-09 | 3 |
| DORA Metrics | [reference/dora.md](reference/dora.md) | ci-03, ci-04, ci-05 | 3 |
| Infrastructure as Code | [reference/iac.md](reference/iac.md) | ci-07 | 1 |
| Artifact Management | [reference/artefacts.md](reference/artefacts.md) | ci-08 | 1 |
| Supply Chain Security | [reference/supply-chain.md](reference/supply-chain.md) | ci-10 | 1 |

## Output format

```markdown
## CI/CD & Release Management — Overall score: X.X/4 (Y questions scored out of Z)

### Summary
[2-3 sentences summarizing CI/CD maturity]

### Detail per question

| Code | Question | Criticality | Level | Confidence | Justification |
|------|----------|-------------|-------|------------|---------------|
| ci-01 | CI pipeline architecture (build, lint, test, scan, artifacts) | must | X | high | ... |
| ci-02 | CD pipeline and deployment strategies | must | X | high | ... |
| ci-03 | Deployment frequency (DORA metric) | could | X | low | ... |
| ci-04 | Lead time for changes (DORA metric) | could | X | low | ... |
| ci-05 | Change failure rate (DORA metric) | could | X | low | ... |
| ci-06 | Environment management (dev, staging, preprod, prod) | must | X | high | ... |
| ci-07 | Infrastructure as Code (IaC) | should | X | medium | ... |
| ci-08 | Artifact management and registries | should | X | high | ... |
| ci-09 | Deployment rollback and recovery | must | X | low | ... |
| ci-10 | Pipeline security (Supply Chain Security) | should | X | high | ... |

### Strengths
- ...

### Weaknesses
- ...

### Recommendations
1. [MUST] ...
2. [SHOULD] ...
3. [COULD] ...

### Non-auditable items
- [ci-XX] Description — Reason (requires interview / CI dashboard access / production log access / ...)
```

## Exit condition

- [ ] CI system detected, pipeline files read
- [ ] All 10 questions evaluated (or justified N/A)
- [ ] Verification commands run for each scored question
- [ ] Level (0-4) + confidence + justification per question
- [ ] Domain score computed (average excluding N/A + weighted score, "X scored out of Y")
- [ ] Report produced in the output format
- [ ] Non-auditable items listed

## Changelog

- 1.0.0 (2026-06-19) — initial versioned release + state-of-the-art enrichment (routing, context, protocol, traps, exit condition); audit grids in reference/ (progressive disclosure)

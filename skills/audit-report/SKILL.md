---
name: audit-report
description: Use when consolidating audit results into a report or reformatting existing audit findings - template and scoring rules for the consolidated audit report. Standalone or as reference for the orchestrator. Triggers on "audit report", "rapport audit", "consolider audit", "consolidate audit", "reformat audit findings".
version: 1.0.0
metadata:
  last-reviewed: 2026-06-19
  category: audit
---

## This skill vs. audit-industrialisation

- **This skill** when: reformatting/consolidating **already-produced** audit results into a structured report (scoring + template), or as a scoring reference
- **audit-industrialisation** instead if: the audit must be **produced** end to end (profiling, running the domains, then consolidating) — it uses this skill in Phase 3
- **an `audit-<domain>`**: to evaluate a single domain, not for the global report

---

# Audit Report — template and computation rules

## Role

This skill acts as a **reference document** for generating consolidated audit reports. It can be invoked two ways:
- **Standalone** (`/audit-report`): reformat existing audit results into a structured report
- **Reference**: used by the orchestrator (`audit-industrialisation`) to apply the scoring rules and the template

The orchestration procedure (order in which domain audits run, collection, consolidation) is handled by `audit-industrialisation`.

## Prerequisites

This skill expects the results of one or more domain audits (counts aligned with the audit skills — source: the "Coverage per skill" table in `audit-industrialisation`):
- `audit-ci-cd`: CI/CD & Release Management (section-ci, 10 questions)
- `audit-testing`: Testing & Validation (section-te, 13 questions)
- `audit-security`: Security (section-se, 16 questions)
- `audit-observability`: Observability & Alerting (section-ob + section-al, 15 questions)
- `audit-architecture`: Architecture, Scalability & Availability (sections ar/sc/pa/re/di/su/im, 74 questions)
- `audit-quality`: QA & DevOps + Data Quality (section-qa + section-qu, 28 questions)
- `audit-compliance`: Compliance, Governance & FinOps (sections co/dg/fi, 29 questions)
- `audit-performance-frontend`: Frontend Performance (section-pf, 29 questions)

**Total: 214 questions across 18 sections, 8 domains.**

## Score computation

The domain weights, the domain/global score formula and the maturity classification are the
**single source of truth** in [`reference/scoring-model.md`](reference/scoring-model.md).
Read that file to apply the exact weights and thresholds. Summary:

- **Domain score** = arithmetic mean of the scored questions (**N/A excluded** from the denominator).
- **Global score** = weighted average of the domain scores; non-audited domains excluded.
  Weights: Security 1.5, Testing 1.2, CI/CD 1.0, Observability 1.0, Architecture 1.0,
  Quality 1.0, Compliance 1.0, Frontend Perf 0.8.
- **Maturity levels** (0-4 CMMI-adapted): Initial (0.0-0.9), Managed (1.0-1.9),
  Defined (2.0-2.9), Controlled (3.0-3.5), Optimized (3.6-4.0).

## Processing rules

### N/A handling
- Questions marked N/A are **excluded** from the averages (domain and global).
- List the N/A questions in the "Non-auditable items" section with the reason.

### Low-confidence warning
- If **>50% of a domain's questions** have "low" confidence, add a visible warning in the report for that domain:
  `-- WARNING: majority of evaluations at low confidence. This domain's scores are unreliable. --`
- If >50% of the **global** questions are at low confidence, add a warning in the executive summary.

### Priority critical items (MUST at level 0)
- Any **MUST** criticality question evaluated at **level 0** must appear **first** in the recommendations, tagged `[CRITICAL]`.
- These items are listed before the quick wins in the action plan.

### Cross-domain consistency
- If the **same file** (or component) is cited in several domains with contradictory evaluations (e.g. a file judged "well structured" in quality but "insecure" in security), **flag the inconsistency** in a dedicated report section.
- This helps the reader understand the nuances between domains.

## Prioritization rules

| Criterion | MUST priority |
|---------|--------------|
| Security score 0-1 | Always MUST |
| Hard-coded secrets in the code | Immediate MUST |
| No tests in CI | MUST |
| No tested backup | MUST |
| No production monitoring | MUST |
| GDPR compliance score 0-1 | MUST (legal obligation) |

| Criterion | SHOULD priority |
|---------|----------------|
| Coverage < 50% | SHOULD |
| No ADR | SHOULD |
| No input validation | SHOULD |
| CI pipeline > 15 min | SHOULD |

| Criterion | COULD priority |
|---------|---------------|
| No chaos testing | COULD |
| No DORA metrics | COULD |
| No data catalog | COULD |
| No FinOps | COULD |

## Report template

```markdown
# Software industrialization audit report

**Project:** [project name]
**Date:** [date]
**Scope:** [audited domains]

---

## Executive summary

[3-5 sentences summarizing the project's overall state, major strengths and main risks]
[If >50% of the global questions are at low confidence, add: "WARNING: the majority of evaluations rest on low confidence. This report must be completed by an in-depth analysis."]

**Global score: X.X/4 -- [Level]**

---

## Maturity radar

```
                    CI/CD (X.X)
                       *
                    *     *
  Compliance (X.X) *       * Testing (X.X)
                  *    +    *
  Quality (X.X)   *       * Security (X.X)
                    *     *
                       *
            Archi (X.X)   Observ. (X.X)
```

[Textual radar with the per-domain scores -- adapted to the audited domains]

---

## Scores per domain

| Domain | Score | Level | N/A questions |
|---------|-------|--------|---------------|
| CI/CD & Release | X.X/4 | [level] | X |
| Testing & Validation | X.X/4 | [level] | X |
| Security | X.X/4 | [level] | X |
| Observability & Alerting | X.X/4 | [level] | X |
| Architecture & Availability | X.X/4 | [level] | X |
| Code & Data Quality | X.X/4 | [level] | X |
| Compliance & Governance | X.X/4 | [level] | X |

---

## Detail per domain

### [Domain] -- X.X/4

[Domain summary]
[If >50% low confidence: "WARNING: majority of evaluations at low confidence."]

| Code | Question | Criticality | Level | Confidence | Justification |
|------|----------|-----------|--------|-----------|---------------|
| XX-01 | ... | MUST/SHOULD/COULD | X | high/medium/low | ... |
| XX-02 | ... | MUST/SHOULD/COULD | X or N/A | high/medium/low | ... |

**Strengths:** ...
**Weaknesses:** ...

[Repeat for each domain]

---

## Cross-domain inconsistencies

[If files/components are cited in several domains with contradictory evaluations, list them here]
| File/Component | Domain A | Evaluation A | Domain B | Evaluation B | Comment |
|-------------------|-----------|-------------|-----------|-------------|-------------|
| ... | ... | ... | ... | ... | ... |

[If no inconsistency: "No inconsistency detected."]

---

## Action plan

### Critical (MUST at level 0)
1. [CRITICAL] ...

### Quick wins (low effort, high impact)
2. [MUST] ...
3. [MUST] ...

### Short-term work (1-3 months)
4. [MUST] ...
5. [SHOULD] ...

### Medium-term work (3-6 months)
6. [SHOULD] ...
7. [COULD] ...

### Long-term vision (6-12 months)
8. [COULD] ...

---

## Non-auditable items

- [List the N/A questions and the non-verifiable aspects]
- [Reason: no infra access, no documentation, static hosting, etc.]
- [Impact on the overall reliability of the audit]

---

## Appendices

### Validation methods used
- **code_analysis**: reading the source code and configurations
- **document_review**: checking the existing documentation
- **technical_test**: running analysis commands (npm audit, etc.)
- **observation**: observing the project's structure and patterns

### Reference model
Based on the adapted CMMI maturity model (levels 0-4). The questions are defined in the audit skills (source of the questions).

### Confidence levels
- **high**: direct verification through the code or commands
- **medium**: deduction from partial clues
- **low**: assumption based on the absence of evidence or insufficient context
```

## Structured export (optional, project-specific)

The generic deliverable is the **Markdown report**. A project that manages its audits in a dedicated tool (knowledge base, audit app) may additionally produce a structured export (YAML/JSON) with aligned lowercase IDs (`ci-01`, `te-09a`…) — but that format depends on the target tool and belongs to the **project skill**, not to this generic skill.

## Exit condition

- [ ] Domain score = average of the scored questions (N/A excluded), weighted global score (weight table applied)
- [ ] Maturity classification assigned per the grid
- [ ] Each answer backed by evidence (no opinion without evidence)
- [ ] Recommendations prioritized MUST/SHOULD/COULD + impact projection `(XX-01: current→projected)`
- [ ] Markdown report produced (structured export only if the project requires it)

## Changelog

- 1.0.0 (2026-06-19) — initial versioned release + state-of-the-art enrichment (routing, context, protocol, traps, exit condition)

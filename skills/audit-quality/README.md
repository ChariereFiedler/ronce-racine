# `audit-quality`

> Score a project's quality maturity across 28 questions in two sections — QA & DevOps and Data Quality — on a 0-4 scale.

| | |
|---|---|
| **Type** | Skill (on-demand audit) |
| **Category** | `audit` |
| **Artifact** | [`SKILL.md`](SKILL.md) |
| **Tooling** | Bash verification commands + progressive-disclosure grids in [`reference/`](reference/) |

## What it is

`audit-quality` is a maturity assessment covering **two adjacent domains**:

- **QA & DevOps** (16 questions, QA-01 to QA-14) — test coverage, smoke tests, artifact promotion, CI/CD quality gates and feedback speed, code quality and debt, dependency security, incident reproducibility, profiling, CI/CD security, product observability, code review, and DORA metrics.
- **QU — Data Quality** (12 questions, QU-01 to QU-09a) — input schema validation, null handling, business-consistency checks, anomaly detection and correction, correlation IDs, log/event separation, and data lifetime/purge management.

Each question is scored 0 (absent) to 4 (state of the art). The output is a two-section scored report with a per-section score and a global score.

It is one of eight domain audits orchestrated by [`audit-industrialisation`](../audit-industrialisation/). Invoked on its own, it covers QA/DevOps and data quality only.

## Why it exists

"Quality" is where the most hand-waving happens in engineering reviews. A team says the code is "well tested" and "clean," but there is no shared definition — is coverage gated? Are dependencies scanned in CI? Is input validated server-side or only in the browser? Are personal records purged when their retention period ends?

This skill turns those vague claims into a **checklist with evidence**. Every question ships with concrete bash commands to run and a five-level rubric, so the score reflects what is actually in the repo rather than what the team believes is there. Pairing QA & DevOps with data quality in one skill is deliberate: delivery discipline and data integrity are the two places where a "green" project quietly ships corruption.

## When it triggers

Invoke it when someone asks for a QA/DevOps or data-quality audit:

- "audit qualité", "audit quality"
- "code audit", "QA audit", "devops audit"
- "data audit" — schema validation, data lifecycle, error handling
- assessing test coverage, CI/CD quality, dependency security, or observability

For a full multi-domain project audit, use [`audit-industrialisation`](../audit-industrialisation/) instead — it runs this skill along with the seven others and consolidates the results.

## How it works

### Scoring model

- **Section score** = average of scored questions, excluding N/A.
- **Global score** = average of the two section scores.
- A question is **N/A** when the project profile makes it irrelevant (e.g. the Data Quality section largely N/A for a stateless static site).
- Report "X questions scored out of Y total" per section.

### Audit protocol

After detecting the project type and its N/A set, the skill runs each reference grid — QA & DevOps then QU Data Quality — scoring every question with a level, justification and confidence from the bash commands, then computes the section and global scores and emits the report.

Full step-by-step protocol → [`SKILL.md`](SKILL.md).

### The two reference grids

Each grid holds, per question: the statement, criticality (must/should/could), what to analyze, what to check, the bash commands, and the 0-4 level table.

| Section | Grid | Questions |
|---------|------|-----------|
| QA & DevOps | [`reference/qa-devops.md`](reference/qa-devops.md) | 16 (QA-01 … QA-14) |
| QU — Data Quality | [`reference/qu-qualite-donnees.md`](reference/qu-qualite-donnees.md) | 12 (QU-01 … QU-09a) |

### Criticality and confidence

Each question carries a **criticality** — `must` (fundamental, absence = critical risk), `should` (good practice), or `could` (excellence). Each score also carries a **confidence**: high (verified by command or file read), medium (inferred), or low (needs an interview or a runtime dashboard).

## Worked example

> You audit `beta-app`, a Laravel + Vue fullstack service handling customer records.

1. QA-07 (Dependency security): CI runs `trivy` and blocks on critical CVEs, and a `dependabot.yml` exists → **level 3, high confidence**.
2. QA-13 (Code review): a `CODEOWNERS` file plus branch protection requiring one approval → **level 2, high confidence**; no documented guidelines or review SLA keeps it below 3.
3. QU-01 (Input schema validation): Laravel Form Requests validate every endpoint server-side → **level 2, high confidence**; no schema registry keeps it below 4.
4. QU-08 (Data lifetime): customer records carry personal data but no retention policy or TTL is found in the repo → **level 0, medium confidence**, flagged as a `[MUST]` recommendation for GDPR exposure.
5. QA-14 (DORA metrics): the team is aware of DORA but nothing measures it → **level 1, low confidence** (needs a team interview to confirm).

The global score is the average of the two section scores, and QU-08 rises to the top of the recommendations because unbounded retention of personal data is a compliance risk, not just a hygiene gap.

## Related artifacts

- [`audit-industrialisation`](../audit-industrialisation/) — orchestrates this audit and seven others into one consolidated report.
- [`audit-testing`](../audit-testing/) — a deeper, testing-only maturity grid; overlaps with the QA coverage questions here.
- [`audit-compliance`](../audit-compliance/) — GDPR, data governance and retention from a regulatory angle (complements QU-08).
- [`audit-report`](../audit-report/) — the consolidated report template and scoring rules.

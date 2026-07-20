# `audit-architecture`

> Score a project's architectural maturity - decisions, resilience, scalability, availability, incident management - across 74 questions and 7 sections, each rated 0-4 with evidence.

| | |
|---|---|
| **Type** | Skill (audit protocol) |
| **Category** | `audit` |
| **Artifact** | [`SKILL.md`](SKILL.md) |
| **Tooling** | None (evidence-driven grids; shell verification commands inline) |

## What it is

`audit-architecture` is a structured maturity assessment for the non-functional backbone of a system: how decisions are recorded, how the software behaves under load, how it survives faults, how fast it recovers, what availability it commits to, and how incidents are run. It walks 7 sections and **74 questions**, assigns each a level from 0 (absent) to 4 (state of the art), and produces a single weighted maturity score.

The questions live in progressive-disclosure grids under [`reference/`](reference/) - one file per section - so the LLM only loads the detail for the section it is currently scoring.

## Why it exists

Architectural weaknesses are the ones nobody notices until an incident: no rollback path, no RTO, no circuit breaker, no post-mortem discipline. They are invisible in a feature demo and expensive in production. A repeatable, evidence-based grid turns "the architecture feels mature" into a defensible number, with a per-question rationale that survives review and can be re-run later to measure progress.

It is deliberately **generic**. A project can ship its own variant under `<repo>/.claude/skills/` that tools this same protocol with repo-specific scripts, datasets and CI gates - that variant wins when present.

## When it triggers

Invoke it for a **targeted** audit of this domain, on requests like:

- "audit architecture", "audit archi"
- "audit scalability", "audit availability", "audit resilience", "audit incidents"
- auditing ADRs, API design, coupling, SLA/RPO/RTO, high availability, or incident management

For a **full multi-domain audit**, use [`audit-industrialisation`](../audit-industrialisation/) instead - it orchestrates every audit skill (this one included) and consolidates the results. Do not invoke each audit skill separately.

## How it works

The audit first detects the project type (backend/API, frontend SPA/PWA, fullstack, library/SDK), which decides which questions are marked N/A. It then scores each of the 7 sections in order - reading the matching `reference/<section>.md` grid, running the verification commands, and assigning each question a level 0-4 (or N/A) with evidence. The scored levels are averaged (`Σ(levels) / count(scored questions)`, N/A excluded) into a single maturity score, and the results are handed to [`audit-report`](../audit-report/) for the consolidated write-up.

Full step-by-step protocol, section grids, and per-type N/A sets → [`SKILL.md`](SKILL.md).

## Worked example

> A backend API for `acme-app` is audited. In the PA section the auditor runs the `PA-04` probes:

```bash
grep -ri "circuit.breaker\|circuitbreaker\|half.open\|resilience4j\|opossum" . --include="*.ts" | head -10
```

Nothing turns up: there is a global HTTP timeout but no circuit breaker. Per the grid that is **level 1** ("Global timeout but no circuit breaker. Saturation possible."). The auditor records the level, the evidence (the grep found only a timeout config), and a **MUST** recommendation (PA-04 is criticality MUST).

`PA-04` had no condition, so it is always scored. Contrast with `AR-01a`, which is skipped as N/A whenever `AR-01 < 2` - no point grading the decision *process* when there are no decisions recorded at all. At the end, all scored levels are summed and divided by the count of scored questions to give `acme-app` its architecture maturity score.

## Related artifacts

- [`audit-industrialisation`](../audit-industrialisation/) - the orchestrator; runs all domain audits and consolidates. Use it for a full project audit.
- [`audit-report`](../audit-report/) - the report template and scoring rules this skill hands its results to.
- Sibling domain audits: [`audit-ci-cd`](../audit-ci-cd/), [`audit-security`](../audit-security/), [`audit-observability`](../audit-observability/), [`audit-testing`](../audit-testing/), [`audit-quality`](../audit-quality/), [`audit-compliance`](../audit-compliance/).

# `audit-observability`

> Score a project's observability and alerting maturity - logs, metrics, traces, dashboards, alerts - on a 0-4 scale across 15 questions, with evidence gathered from the code itself.

| | |
|---|---|
| **Type** | Skill (on-demand audit) |
| **Category** | `audit` |
| **Artifact** | [`SKILL.md`](SKILL.md) |
| **Tooling** | Grep/find verification commands; progressive-disclosure grids in [`reference/`](reference/) |

## What it is

`audit-observability` is a structured maturity assessment for one domain: **can you see what your system is doing, and are you told when it breaks?** It walks 15 questions split into two areas - Observability (OB, 9 questions: logging, baggage, metrics, traces, dashboards, latency, pools, transient errors) and Alerting (AL, 6 questions: catalog, notifications, correlation, runbooks, thresholds, post-mortems) - and assigns each a level from 0 (absent) to 4 (state of the art), backed by concrete evidence from the repository.

The heavy detail lives in four reference grids, loaded on demand:

- [`reference/logging.md`](reference/logging.md) - ob-01 to ob-03
- [`reference/metriques.md`](reference/metriques.md) - ob-04, ob-07, ob-08, ob-09
- [`reference/traces-dashboards.md`](reference/traces-dashboards.md) - ob-05, ob-06
- [`reference/alerting.md`](reference/alerting.md) - al-01 to al-06

## Why it exists

Observability gaps are invisible until an incident, and by then it is too late to add instrumentation. A maturity audit surfaces the gaps in advance, prioritized: which MUST-level controls are missing, which SHOULD-level practices would cut mean-time-to-detect, and which are simply not applicable to this project type. Turning a vague "we should have better monitoring" into a scored, evidence-backed grid makes the work plannable.

It is deliberately **single-domain**. For a whole-project maturity review across all engineering domains, `audit-industrialisation` orchestrates this skill together with its siblings and consolidates the scores - invoke that instead of running each audit by hand.

## When it triggers

Invoke it when the user asks for a targeted observability or alerting review:

- "audit observability" / "observability audit"
- "audit logs" / "audit monitoring" / "audit alerting"

Do **not** invoke it for a full multi-domain audit - route to `audit-industrialisation`, which calls this skill as one of its components.

## How it works

The skill detects the project type (to pick the grid variant and N/A set) and the observability stack, then works each of the 15 questions from its reference grid - running the verification commands, reading the evidence, and assigning a level 0-4 with a confidence and justification - before averaging the scored questions and emitting the report.

Full step-by-step protocol → [`SKILL.md`](SKILL.md).

### Scoring at a glance

Each question carries a criticality (MUST / SHOULD / COULD) that drives recommendation priority, and a level table where roughly: 0 = absent, 1 = ad-hoc, 2 = basic/documented, 3 = systematic with tooling, 4 = state of the art (ML, adaptive, self-service). The overall score is a plain average of scored questions - N/A never drags it down.

## Worked example

> A backend API is audited. Logs are JSON with a timestamp and level but carry no traceId; there is a Prometheus `/metrics` endpoint with RED metrics on the main routes; there is no runbook and no post-mortem template.

- **ob-01 (structured logs, MUST)** → level 2. JSON with basic fields but no traceId/spanId for cross-service correlation. Confidence: high (grep found the logger config and no `traceparent`).
- **ob-04 (RED/USE, SHOULD)** → level 2. RED on main endpoints, no USE on resources. Confidence: high.
- **al-04 (runbook, SHOULD)** → level 0. `find` returned no runbook/playbook file. Confidence: high.
- **al-06 (post-mortem, SHOULD)** → level 0. No template found.

The report then recommends, in priority order: `[MUST]` add traceId propagation to reach ob-01 level 3, `[SHOULD]` introduce a runbook per critical alert, `[SHOULD]` adopt a blameless post-mortem template.

## Related artifacts

- [`audit-industrialisation`](../audit-industrialisation/) - orchestrates all domain audits (including this one) into a consolidated report; use it for a full project audit.
- [`audit-report`](../audit-report/) - template and scoring rules for the consolidated report.
- [`audit-quality`](../audit-quality/) - QA/DevOps audit; overlaps on error handling and observability from the quality angle.
- [`audit-architecture`](../audit-architecture/) - resilience, SLA/RPO/RTO and incident management, which pair naturally with alerting maturity.

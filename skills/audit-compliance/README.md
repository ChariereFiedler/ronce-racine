# `audit-compliance`

> Score a project's compliance, data-governance and FinOps maturity - GDPR, retention, right to erasure, data ownership, cloud cost control - on a 0-4 scale across 29 questions, with evidence gathered from the code itself.

| | |
|---|---|
| **Type** | Skill (on-demand audit) |
| **Category** | `audit` |
| **Artifact** | [`SKILL.md`](SKILL.md) |
| **Tooling** | Grep/find verification commands; progressive-disclosure grids in [`reference/`](reference/) |

## What it is

`audit-compliance` is a structured maturity assessment spanning three related domains that all revolve around **data you are legally and financially accountable for**:

- **CO - Compliance & Regulatory** (10 questions): GDPR minimization, anonymization, retention, DPIA, right to erasure, deletion logging.
- **DG - Data Governance** (8 questions): ownership, catalog, migrations, data contracts, quality, sensitive-data classification, lifecycle, Data Mesh.
- **FI - FinOps** (11 questions): cost monitoring, caching, batching, per-customer attribution, abuse detection, cloud-waste elimination, reservations.

Each question gets a level from 0 (absent) to 4 (state of the art), justified by concrete evidence from the repository. The detail for each section lives in a reference grid loaded on demand:

- [`reference/conformite-rgpd.md`](reference/conformite-rgpd.md) - CO-01 to CO-07a
- [`reference/gouvernance-donnees.md`](reference/gouvernance-donnees.md) - DG-01 to DG-08
- [`reference/finops.md`](reference/finops.md) - FI-01 to FI-08

## Why it exists

Compliance and cost debt are silent: nothing fails a test suite because there is no purge API or no cost tagging, yet both are real liabilities - a regulator's request you cannot fulfil, a cloud bill nobody can explain. A maturity audit turns that latent risk into a scored, evidence-backed grid, so the MUST-level gaps (a missing DPIA, no deletion propagation) rise to the top of the backlog ahead of the nice-to-haves.

It is deliberately **single-domain**. For a whole-project maturity review across all engineering domains, `audit-industrialisation` orchestrates this skill together with its siblings and consolidates the scores - invoke that instead of running each audit by hand.

## When it triggers

Invoke it when the user asks for a targeted compliance, data-governance or cost review:

- "audit compliance" / "compliance audit"
- "audit GDPR" / "audit data governance"
- "audit finops"

Do **not** invoke it for a full multi-domain audit - route to `audit-industrialisation`, which calls this skill as one of its components.

## How it works

The audit identifies the project type first (which drives the N/A sets - a local-first SPA marks the server-side CO and all FI questions N/A, a library marks entire CO and FI sections N/A), then works the CO, DG and FI sections in turn: running each grid's verification commands, reading the evidence, and assigning a level 0-4 with a confidence and justification. Conditional sub-questions are scored only when their parent reaches level ≥ 2. Per-section and overall scores are `Σ(levels) / count(scored questions)` excluding N/A, and the results feed the standard report with prioritized MUST/SHOULD/COULD recommendations.

Full step-by-step protocol, per-type variants, and output format → [`SKILL.md`](SKILL.md).

### Scoring at a glance

Criticality (MUST / SHOULD / COULD) drives recommendation priority; the level tables run roughly 0 = absent, 1 = ad-hoc, 2 = documented/basic, 3 = systematic with tooling, 4 = state of the art. N/A questions never drag the average down.

## Worked example

> A multi-tenant backend for **acme-app** is audited. There is a documented retention policy but no automated purge; a `DELETE /users/:id` endpoint exists but does not propagate to the third-party CRM; resources are tagged per tenant but there is no cost dashboard.

- **CO-03 (retention policy, SHOULD)** → level 1. Policy documented but not implemented (no TTL, no purge script found). Confidence: high.
- **CO-05 (purge API, MUST)** → level 1. Basic deletion endpoint, no propagation. Confidence: high.
- **CO-06 (third-party propagation, MUST)** → level 0. `grep` found the CRM integration but no deletion propagation. Confidence: high.
- **FI-04 (per-customer attribution, SHOULD)** → level 2. Per-tenant tagging present, reports manual. Confidence: medium.
- **FI-01a (granularity, SHOULD)** → scored, since FI-01 reached ≥ 2.

The report then recommends, in priority order: `[MUST]` implement deletion propagation to the CRM (CO-06), `[MUST]` complete the purge API and enforce the retention policy, `[SHOULD]` build a FinOps dashboard on top of the existing tags.

## Related artifacts

- [`audit-industrialisation`](../audit-industrialisation/) - orchestrates all domain audits (including this one) into a consolidated report; use it for a full project audit.
- [`audit-report`](../audit-report/) - template and scoring rules for the consolidated report.
- [`audit-security`](../audit-security/) - encryption, secrets and access control, which overlap with sensitive-data protection (DG-06) and GDPR.
- [`audit-quality`](../audit-quality/) - covers data validation and data lifecycle from the QA angle, complementing DG-02 and DG-07.

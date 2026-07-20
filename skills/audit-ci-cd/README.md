# `audit-ci-cd`

> Score a project's CI/CD and release-management maturity — pipelines, deployment, DORA metrics, IaC, artifacts, supply chain — on a 0-4 scale with prioritized, evidence-backed recommendations.

| | |
|---|---|
| **Type** | Skill (on-demand audit) |
| **Category** | `audit` |
| **Artifact** | [`SKILL.md`](SKILL.md) |
| **Tooling** | Bash (git, grep, ls) — read-only inspection; progressive-disclosure grids in [`reference/`](reference/) |

## What it is

`audit-ci-cd` is one domain audit in a family of maturity audits. It takes a repository and produces a structured assessment of how the team ships software: how the CI pipeline is built, how code reaches production, how fast and how safely that happens, and how the delivery chain is secured.

The domain is broken into **10 questions** (`ci-01` … `ci-10`) across 6 sections. Each question carries a criticality (`must` / `should` / `could`), a set of bash commands that gather objective evidence, an explicit checklist, and a 0-4 level rubric. The skill runs the commands, reads the pipeline files, scores each question with a confidence level, and emits a report with an overall (optionally weighted) score.

## Why it exists

CI/CD maturity is easy to assert and hard to prove. "We have a pipeline" says nothing about whether it caches dependencies, runs SAST, promotes a single immutable artifact between environments, or can roll back in under five minutes. This skill replaces impressions with evidence:

- **Objective first** — every question starts from commands (`git log`, `grep` over workflow files, `ls` of IaC directories), so a score is anchored to what is actually in the repo.
- **Honest about confidence** — DORA metrics in particular (`ci-03`/`ci-04`/`ci-05`) often can't be settled from the repo alone. The skill marks those `low` confidence and lists them as non-auditable rather than inventing a number.
- **Prioritized** — criticality weighting means a missing rollback procedure (`must`) outranks a missing SBOM (`could`) in the recommendations.

## When it triggers

Invoke it for a **domain-scoped** CI/CD audit. Trigger phrases: "audit ci", "audit pipeline", "audit deployment", "audit release".

For a **full multi-domain** project audit, use [`audit-industrialisation`](../audit-industrialisation/) instead — it orchestrates every domain audit (this one included) and consolidates the results. Do not invoke each domain skill by hand for a global audit.

## How it works

The audit starts objective: it detects and reads the CI pipeline files, then for each of the 10 questions (`ci-01` … `ci-10`) runs the verification commands from the matching `reference/` grid and inspects deployment configs and `package.json` scripts. Each question gets a level 0-4 with a confidence tag (high / medium / low) or N/A when the profile makes it irrelevant. DORA metrics (`ci-03`/`ci-04`/`ci-05`) are typically low-confidence and flagged non-auditable rather than guessed. Scores are averaged (and optionally criticality-weighted, `must`=3 / `should`=2 / `could`=1) and emitted through the standard report format with prioritized recommendations.

Full step-by-step protocol, section grids, and output format → [`SKILL.md`](SKILL.md).

## Worked example

> Auditing `acme-app`, a Node service with a GitHub Actions pipeline and a Helm chart, but no rollback runbook.

1. **Detect** — `ls` finds `.github/workflows/ci.yml`; it is read in full.
2. **ci-01** — the workflow has lint → build → test → publish, with `actions/cache` and a build matrix. Feedback ~8 min from the logs. Level **3**, confidence **high**.
3. **ci-02** — a `deploy` job runs `helm upgrade` with a rolling update, gated on a manual approval. No canary. Level **2**, confidence **high**.
4. **ci-09** — `grep` over `docs/`, `scripts/`, and the workflow finds no rollback procedure and no health-check-driven auto-revert. Level **1**, confidence **medium**. Because `ci-09` is a `must`, this drives the top recommendation.
5. **ci-03/04/05** — `git tag`/`git log` show weekly tags, but change failure rate can't be derived from the repo. Levels tentative, confidence **low**, listed under non-auditable items ("requires CI dashboard access").
6. **Report** — weighted overall score, with `[MUST] Document and automate a one-command rollback for acme-app` first in the recommendations.

## Related artifacts

- [`audit-industrialisation`](../audit-industrialisation/) — orchestrator that runs all domain audits and consolidates them; use it for a full audit.
- [`audit-report`](../audit-report/) — template and scoring rules for the consolidated report.
- [`audit-security`](../audit-security/) — application security audit; overlaps with `ci-10` on secrets and supply chain.
- [`audit-observability`](../audit-observability/) — logging, metrics, tracing, and alerting; complements deployment health and DORA signals.

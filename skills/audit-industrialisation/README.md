# `audit-industrialisation`

> Orchestrate a full, evidence-based audit of a project's software-engineering maturity: profile the project, run 8 domain audits in parallel, and consolidate a single scored report.

| | |
|---|---|
| **Type** | Skill (orchestrator workflow) |
| **Category** | `audit` |
| **Artifact** | [`SKILL.md`](SKILL.md) |
| **Tooling** | Subagents (Agent tool), shell detection commands; no bespoke script |

## What it is

`audit-industrialisation` is the **entry point** for a complete maturity audit. It does not carry the questions itself - those live in the eight domain skills (`audit-ci-cd`, `audit-testing`, `audit-security`, `audit-observability`, `audit-architecture`, `audit-quality`, `audit-compliance`, `audit-performance-frontend`). Its job is to **profile** the project once, **fan out** the eight audits as parallel subagents, then **consolidate** their results into one weighted, classified report.

The reference model is **214 questions across 18 sections and 8 domains**, each question scored on a 0-4 maturity scale (CMMI-adapted) or marked N/A.

## Why it exists

Running eight audits by hand is slow and inconsistent: each agent rediscovers the stack, questions get re-worded, IDs drift, and the final scores are impossible to compare across runs. The orchestrator fixes three things:

- **One shared profile.** The project is detected and described once, then that block is pasted into every subagent prompt - no agent re-derives the framework, database or CI system.
- **Stable IDs and stable weights.** Question IDs (`ci-01`, `te-09a`…) and the domain weight table are identical everywhere, so two audits of the same project are comparable.
- **Evidence over opinion.** Every level must rest on a captured command output, a source excerpt, or a document quote - or the question is marked non-auditable. No blind scoring.

## When it triggers

Invoke it for a **global, multi-domain** assessment - phrases like "industrialisation audit", "full audit", "project audit", "maturity audit", "global audit".

- Use a **single `audit-<domain>`** instead when the scope is one domain (e.g. just security).
- `audit-report` is used **inside** this skill (Phase 3) for the scoring rules and report template - it is not a competitor.

## How it works

The orchestrator runs in four phases. It first profiles the project once (detection commands + a relevance matrix that marks domains N/A by project type), then fans the 8 domain audits out as parallel subagents, each handed that shared profile and returning a mandatory per-question table plus recommendations. Phase 3 consolidates: domain scores are means (N/A excluded), the global score is a weighted mean (Security ×1.5, Testing ×1.2, Frontend Perf ×0.8, others ×1.0), a CMMI-style classification is assigned, and recommendations are prioritised and grouped into a dated action plan saved to `docs/audit/YYYY-MM-DD-audit-industrialisation.md`. Throughout, every level must rest on captured evidence (`code_analysis` / `technical_test` / `document`) rather than opinion.

Full phase-by-phase protocol, subagent prompt template, weight and classification tables → [`SKILL.md`](SKILL.md).

## Worked example

> You run a full audit on `acme-app`, a fullstack TypeScript app with GitLab CI and PostgreSQL.

1. Phase 1 detects the stack and produces the profile block; the relevance matrix keeps all 8 domains ("adapted" for Frontend Perf).
2. Phase 2 fans out 8 subagents. `audit-security` scores `se-04` (secrets management) at level 1 with high confidence, citing a hard-coded token found by grep.
3. Phase 3 computes a global score of, say, 2.3/4 - **Defined** - and lifts the hard-coded secret to an immediate MUST at the top of the plan.
4. The report lands in `docs/audit/2026-07-10-audit-industrialisation.md`, every level cited with evidence.

Scoping to `$ARGUMENTS = security testing` would run only those two domains and adapt the report to that scope.

## Related artifacts

- [`audit-report`](../audit-report/) - the scoring rules and report template used in Phase 3 (and usable standalone).
- [`audit-quality`](../audit-quality/), [`audit-security`](../audit-security/), [`audit-testing`](../audit-testing/), and the other five `audit-*` skills - the domains this orchestrator fans out to.

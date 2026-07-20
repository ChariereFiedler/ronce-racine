# `audit-report`

> The scoring rules and report template for a consolidated industrialization audit — usable standalone to reformat existing findings, or as the reference the orchestrator applies in its consolidation phase.

| | |
|---|---|
| **Type** | Skill (reference + reformatting workflow) |
| **Category** | `audit` |
| **Artifact** | [`SKILL.md`](SKILL.md) |
| **Tooling** | None (documentary reference; inline template) |

## What it is

`audit-report` is the **scoring and formatting layer** of the audit system. It defines how domain results turn into a single report: how to average a domain, how to weight the global score, how to classify maturity, how to handle N/A and low-confidence questions, and the exact Markdown structure of the deliverable.

It is deliberately **stateless about orchestration** — it does not run audits or collect results. It takes results that already exist and shapes them, or it lends its rules to `audit-industrialisation`.

## Why it exists

The scoring rules must be **one source of truth**. If the weight table or the maturity thresholds lived only inside the orchestrator, a standalone reformat would drift from a full audit. Splitting them out means:

- **Standalone reuse** — `/audit-report` reformats findings someone already produced (even by hand) into the canonical report.
- **Shared reference** — `audit-industrialisation` Phase 3 applies these exact rules, so both paths yield identical scores.
- **A single template** — everyone gets the same sections: executive summary, maturity radar, per-domain detail, cross-domain inconsistencies, prioritized action plan, non-auditable items, appendices.

> The weight table and classification are **duplicated** in `audit-industrialisation` (Phase 3) on purpose (so each can run alone). Any change must be mirrored in both files.

## When it triggers

Invoke it when you have **already-produced** audit results and want them consolidated or reformatted — "audit report", "consolidate audit", "reformat audit findings".

- Use **`audit-industrialisation`** instead when the audit must be produced end to end (profiling, running the domains, then consolidating).
- Use a single **`audit-<domain>`** to evaluate one domain, not to build the global report.

## How it works

The sub-sections below give the shape of the scoring model and processing rules; the authoritative weight table, classification thresholds and full Markdown template live in [`SKILL.md`](SKILL.md).

### Scoring

- **Domain score** = arithmetic mean of the domain's question levels, **N/A excluded** from the denominator. Example: scores `[2, 3, N/A, 1, 2, 2, N/A, 3]` → `(2+3+1+2+2+3)/6 = 2.17/4`.
- **Global score** = weighted average — Security ×1.5, Testing ×1.2, CI/CD / Observability / Architecture / Quality / Compliance ×1.0, Frontend Perf ×0.8. Non-audited domains are dropped (weight ignored).
- **Classification**: Initial (0.0–0.9) → Managed → Defined → Controlled → Optimized (3.6–4.0).

### Processing rules

- **N/A** questions are excluded from averages and listed under "Non-auditable items" with a reason.
- **Low-confidence warning**: if >50% of a domain's questions are low-confidence, a visible warning is added; same at the executive-summary level if >50% globally.
- **Critical items**: any MUST question at level 0 is tagged `[CRITICAL]` and listed first, before the quick wins.
- **Cross-domain consistency**: the same file scored contradictorily across domains (e.g. "well structured" in quality, "insecure" in security) is flagged in a dedicated section.

### Prioritization

MUST covers e.g. security score 0-1, hard-coded secrets (immediate MUST), no tests in CI, no tested backup, no production monitoring, GDPR score 0-1. SHOULD covers e.g. coverage < 50%, no ADR, no input validation, CI pipeline > 15 min. COULD covers e.g. no chaos testing, no DORA metrics, no data catalog, no FinOps.

### Template

The SKILL.md carries the full Markdown template — executive summary (+ confidence warning), maturity radar, scores-per-domain table, per-domain detail tables, cross-domain inconsistencies, action plan (Critical → Quick wins → Short → Medium → Long), non-auditable items, and appendices (validation methods, reference model, confidence levels).

## Worked example

> You are handed raw notes from a partial audit of `beta-app` covering only Security and Testing.

1. You compute each domain mean (N/A excluded): Security 1.8, Testing 2.5.
2. Global = `(1.8×1.5 + 2.5×1.2) / (1.5 + 1.2) = 2.11/4` → **Defined**; the other six weights are ignored (not audited).
3. A MUST security question sits at level 0 → it becomes a `[CRITICAL]` item at the top of the action plan.
4. You emit the report with only the two audited domains in the radar and the scores table, and list every untouched area under "Non-auditable items".

## Related artifacts

- [`audit-industrialisation`](../audit-industrialisation/) — the orchestrator that produces the audit end to end and applies these rules in Phase 3.
- The eight `audit-*` domain skills (e.g. [`audit-security`](../audit-security/), [`audit-testing`](../audit-testing/)) — the source of the questions being scored.

# `audit-security`

> Score a project's application-security maturity across 16 questions in 7 sections, each rated 0-4 with justification and confidence.

| | |
|---|---|
| **Type** | Skill (on-demand workflow) |
| **Category** | `audit` |
| **Artifact** | [`SKILL.md`](SKILL.md) |
| **Tooling** | None (analysis-driven; bash checks per question in `reference/`) |

## What it is

`audit-security` is a structured maturity assessment for the security posture of a codebase. It walks 16 questions grouped into 7 sections - encryption & TLS, secrets, authentication & identity, authorization & audit log, incident response, detection & patching, network & containers - and assigns each one a level from 0 (absent) to 4 (state of the art), with a justification and a confidence rating. The result is a domain score and a report of strengths, weaknesses, and prioritized recommendations.

The detailed grids live under [`reference/`](reference/) as a progressive-disclosure layer: `SKILL.md` carries the protocol, scoring rules, and output format, while each reference file holds the statement, the items to check, the bash commands, and the 0-4 level table for its questions.

## Why it exists

Security reviews tend to be either a vague gut-check ("looks fine") or an unbounded pentest. This skill sits in between: a **repeatable, evidence-driven grid** that any agent can run against a repo to produce a comparable score. Because every question comes with concrete verification commands and explicit level criteria, two runs on the same codebase converge, and a run three months later shows real movement rather than mood.

It is deliberately scoped to what static analysis of a repository can see. Anything that cannot be verified that way - runtime config, an external WAF, pentest results - is reported under **non-auditable items** rather than silently scored.

## When it triggers

Invoke it for a **targeted security audit** of a single project. Trigger phrases include:

- "audit sécurité" / "audit security"
- "audit auth"
- "audit secrets"

For a **full multi-domain maturity audit**, use [`audit-industrialisation`](../audit-industrialisation/) instead - it orchestrates all the domain audits (this one included) and produces a consolidated report. Do not invoke each domain skill separately when a global audit is wanted.

## How it works

The stages below sketch the approach; the full step-by-step protocol → [`SKILL.md`](SKILL.md).

### 1. Identify the project type

Backend, SPA frontend, fullstack, library, or microservices. The project type marks certain questions **N/A** - a frontend SPA without a backend has no DB encryption or server-side authorization to score; a library has no containers unless it ships a Docker image. The [Variants by project type](SKILL.md#variants-by-project-type) section spells out the N/A sets.

### 2. Run the audit protocol

Scan for secrets, check `.gitignore`, read server configs, analyze auth (JWT, refresh, revocation, IdP/SSO/MFA), verify roles (RBAC/ABAC, least privilege), review audit logs, incident response, the CI pipeline (SAST/SCA, Dependabot, container scanning), network security, and container security. Run `npm audit` (or the language equivalent) for a vulnerability snapshot, then execute the per-question verification commands from the reference grids.

### 3. Score each question

- Assign a level 0-4 with a justification and a confidence (high/medium/low).
- Sub-questions (SE-02a, SE-04a, SE-07a) are full questions in the average. Some have a dependency gate - e.g. SE-02a is only evaluated if SE-02 >= level 2.
- **Domain score = average of scored questions, excluding N/A**, reported as "X scored out of Y".

### 4. Produce the report

Use the [output format](SKILL.md#output-format): summary, the per-question table, strengths, weaknesses, prioritized recommendations ([MUST]/[SHOULD]/[COULD]), and the non-auditable items.

## Worked example

> You audit `acme-app`, a fullstack Node.js service, on request "fais un audit sécurité".

1. **Project type**: fullstack - no questions marked N/A.
2. **Secrets scan + configs**: `grep -r` finds no hardcoded secrets, `.env` is gitignored, Traefik terminates TLS 1.3 with HSTS. → SE-01 scored **3**.
3. **Auth**: JWTs are RS256 with a 1h lifetime and refresh tokens, but no revocation path exists (SE-04a). → SE-04 **2**, SE-04a **1** (dependency gate satisfied since SE-04 >= 2).
4. **Patching**: Dependabot is configured but there is no severity SLA. `npm audit` reports two moderate advisories. → SE-09 **2**.
5. **Incident response**: no documented IRP found. → SE-07 **0**, and SE-07a is left **N/A** (dependency gate: SE-07 < level 2).
6. **Report**: domain score computed over the scored questions, with the top recommendation "[MUST] add a token revocation mechanism (SE-04a)" and the SIEM finding listed under non-auditable items because detection is handled by an external platform.

## Related artifacts

- [`audit-industrialisation`](../audit-industrialisation/) - orchestrates the full multi-domain audit and consolidates the report.
- [`audit-report`](../audit-report/) - the template and scoring rules for the consolidated report.
- [`audit-ci-cd`](../audit-ci-cd/) - sibling domain audit for pipelines, deployment, and supply-chain security.
- [`audit-observability`](../audit-observability/) - sibling domain audit for logging, metrics, tracing, and alerting.

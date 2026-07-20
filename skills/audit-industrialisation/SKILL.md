---
name: audit-industrialisation
description: Full software-industrialisation audit. Orchestrates the 8 domain audits and produces a consolidated report. Use when running a full audit of a project's software engineering maturity. Triggers on "audit industrialisation", "industrialisation audit", "audit complet", "full audit", "audit projet", "project audit", "audit maturité", "maturity audit", "audit global", "global audit".
version: 1.0.1
metadata:
  last-reviewed: 2026-07-20
  category: audit
---

# Software industrialisation audit

Full audit of a software project's industrialisation maturity. Orchestrates the 8 domain audits through parallel subagents and produces a consolidated report.

**214 questions, 18 sections, 8 domains, 0-4 maturity model.**

## This skill vs. a domain audit

- **This skill** when: a global, multi-domain audit - it profiles the project, orchestrates the 8 domain audits in parallel and consolidates the report
- **A single `audit-<domain>`** instead if: the scope targets one domain (e.g. just `audit-security`)
- **`audit-report`**: NOT invoked - Phase 3 reuses its template and its `audit-report/reference/scoring-model.md` directly (see Phase 3)

## Where the questions come from

The 214 questions are **defined in the audit skills themselves**: each `audit-<domain>` and its `reference/<section>.md` files carry the wording, the criticality and the 0-4 levels, with stable IDs (`ci-01`, `te-09a`, `PF-21`… - casing varies by domain grid; compare IDs case-insensitively). This orchestrator **defines no questions** - it profiles the project, launches the audits and consolidates. The IDs are identical across the orchestrator, the skills and the report.

### Coverage per skill

| Skill | Sections | Question count |
|-------|--------|-------------|
| `audit-ci-cd` | ci | 10 |
| `audit-testing` | te | 13 |
| `audit-security` | se | 16 |
| `audit-observability` | ob, al | 15 |
| `audit-architecture` | ar, sc, pa, re, di, su, im | 74 |
| `audit-quality` | qa, qu | 28 |
| `audit-compliance` | co, dg, fi | 29 |
| `audit-performance-frontend` | pf | 29 |

**Total: 214 questions across 18 sections, 8 domains.**

> A project that manages its audits in a dedicated tool (external knowledge base, audit app) adds the export to that tool in its **own project skill** - it is not the job of the generic orchestrator, which produces a Markdown report.

## Phase 1 - Reconnaissance and project profile

Before launching the audits, **build a structured project profile** that will be passed to every subagent. This prevents each agent from rediscovering the context.

### Automatic detection

```bash
# Language and framework
ls package.json go.mod requirements.txt Cargo.toml pom.xml build.gradle 2>/dev/null
# CI/CD
ls .github/workflows/*.yml .gitlab-ci.yml Jenkinsfile bitbucket-pipelines.yml .circleci/config.yml 2>/dev/null
# Infrastructure
ls Dockerfile docker-compose*.yml terraform/ pulumi/ .cloud/ kubernetes/ helm/ 2>/dev/null
# Tests
ls vitest.config.* jest.config.* playwright.config.* cypress.config.* pytest.ini 2>/dev/null
# Quality
ls .eslintrc* eslint.config.* .prettierrc* biome.json .editorconfig tsconfig.json 2>/dev/null
```

### Profile to produce

Generate this text block and include it in EVERY subagent prompt:

```
## Project profile
- **Name**: [name]
- **Type**: [backend API | frontend SPA/PWA | fullstack | library/SDK | data pipeline | infrastructure]
- **Language(s)**: [TypeScript, Python, Go, etc.]
- **Framework**: [Nuxt, Next.js, NestJS, Django, Spring, etc.]
- **Architecture**: [monolith | monorepo | microservices | client-side only]
- **Backend**: [yes/no - if no, adapt the server-side questions]
- **Database**: [PostgreSQL, MongoDB, IndexedDB, none, etc.]
- **CI/CD**: [GitHub Actions | GitLab CI | Jenkins | none]
- **Deployment**: [Docker, K8s, serverless, static hosting, etc.]
- **Root path**: [/path/to/project]
```

### Relevance matrix

Depending on the profile, mark the N/A domains:

| Project type | CI/CD | Testing | Security | Observability | Architecture | Quality | Compliance | Frontend Perf |
|---------------|-------|---------|----------|---------------|-------------|---------|------------|---------------|
| Backend API | yes | yes | yes | yes | yes | yes | yes | N/A |
| Frontend SPA/PWA | yes | yes | yes (adapted) | client-adapted | yes | yes | adapted | **yes** |
| Fullstack | yes | yes | yes | yes | yes | yes | yes | adapted |
| Library/SDK | yes | yes | adapted | N/A | adapted | yes | N/A | adapted |
| Data pipeline | yes | yes | yes | yes | adapted | yes | yes | N/A |

**"adapted"** = the domain applies but some questions become N/A. The subagent must read the "Variants" section of the matching skill.

## Phase 2 - Running the domain audits

Launch the **8 subagents in parallel** (Agent tool). Each subagent receives:
1. The **project profile** (block above)
2. The instruction to **read the domain's SKILL.md**
3. The expected **output format** (below)

### Prompt template for each subagent

```
You are auditing the [DOMAIN] domain on the following project.

[PROJECT PROFILE - paste the block]

## Instructions
1. Read the audit skill `audit-[domain]` (invoke it, or read its `SKILL.md`)
2. Follow the audit procedure described in the skill
3. For each question, assign a level (0-4) or N/A with:
   - A factual justification (cite files, lines, commands)
   - A confidence level (high/medium/low)
4. Run the verification commands listed in the skill whenever possible
5. Compute the domain score: average of the scored questions (exclude N/A)

## MANDATORY output format

### [Domain] - Score: X.X/4 (Y questions scored out of Z)

| Code | Question | Criticality | Level | Confidence | Justification |
|------|----------|-----------|--------|-----------|---------------|
| XX-01 | ... | must | X | high | ... |
| XX-02 | ... | should | N/A | - | ... |

### Strengths
- ...

### Weaknesses
- ...

### Recommendations
1. [MUST] ... *(XX-01: 0→2)*
2. [SHOULD] ... *(XX-03: 1→3)*
3. [COULD] ... *(XX-05: 2→3)*

### Non-auditable items
[Questions requiring an interview, field observation, or access to external systems]
```

## Phase 3 - Report consolidation

**Do not invoke audit-report.** Consolidate directly following the rules below.

### Score computation & classification

The domain weights, the domain/global score formula and the maturity classification are the
**single source of truth** owned by the `audit-report` skill (its `scoring-model.md`, under
that skill's `reference/` folder). Read that file and apply the exact weights and
thresholds - they are **not** duplicated here.

Reminders: domain score = mean of the scored questions (N/A excluded); global score =
weighted average of the audited domains (fully-N/A domains excluded); maturity levels run
from Initial to Optimized on the 0-4 CMMI-adapted grid.

### Recommendation prioritisation

Collect all recommendations from the 8 domains and sort them:

| Priority | Criterion |
|----------|-----------|
| **Immediate MUST** | Score 0 on a "must" criticality question |
| **MUST** | Score 0-1 on a "must" question, or active security risk |
| **SHOULD** | Score 0-1 on a "should" question, or score 1-2 on a "must" |
| **COULD** | Score 0-2 on a "could" question |

Group into:
1. **Quick wins** (effort < 1 day, immediate impact)
2. **Short term** (1-3 months)
3. **Medium term** (3-6 months)
4. **Vision** (6-12 months)

### Impact projection

For each action in the plan, indicate the expected progression: `(XX-01: current→projected)`.
Compute the projected score if quick wins + short term are implemented.

### Final report format

```markdown
# Software industrialisation audit report

**Project:** [name] | **Date:** [YYYY-MM-DD] | **Global score: X.X/4 - [Level]**

## Project profile
[Profile block]

## Executive summary
[3-5 sentences: overall state, major strengths, critical risks]

## Maturity radar
[Textual ASCII radar with the 8 domain scores (fully-N/A ones excluded)]

## Scores per domain
| Domain | Score | Questions | Level |
[table]

## Detail per domain
[For each domain: summary + question table + strengths/weaknesses]

## Action plan
### Quick wins
### Short term (1-3 months)
### Medium term (3-6 months)
### Vision (6-12 months)

## Impact projection
[Current vs projected table per domain]

## Non-auditable items
[Questions requiring an interview, an observation, or external access]

## Appendices
### Validation methods
### Reference model
```

Save to `docs/audit/YYYY-MM-DD-audit-industrialisation.md`.

## Phase 4 - Evidence & traceability

**The auditor does not give an opinion - it proves.** Every assigned level rests on factual evidence, captured during Phase 2 and cited in the report:

- **`code_analysis`**: excerpt of the relevant source file
- **`technical_test`**: output of an executed command (grep, `npm audit`, `ls`…)
- **`document`**: excerpt of a reference document (README, ADR…)

Rules:
- Cite the evidence next to the justification (`questionId` + short description).
- Capture command outputs rather than summarising them from memory.
- No evidence possible → question `N/A` / non-auditable with its reason, never scored blind.
- Keep, per question: level (0-4 or N/A), criticality (must/should/could), confidence (high/medium/low), validation method. These fields feed the report's "Detail per domain" table and the "Validation methods" appendix.

## Adaptation

If `$ARGUMENTS` contains domain names (`ci`, `testing`, `security`, `observability`, `architecture`, `quality`, `compliance`, `performance-frontend`), only launch the requested domains. The report adapts to the scope.

## Exit condition

- [ ] Project profile built and passed to each subagent (Phase 1)
- [ ] Relevance matrix applied - N/A domains marked, not audited blind
- [ ] 8 domain audits run (or requested subset), each question scored 0-4 or N/A **with factual evidence**
- [ ] Weighted global score computed (N/A excluded), maturity classification assigned
- [ ] Prioritised action plan (MUST/SHOULD/COULD) + impact projection
- [ ] Markdown report saved to `docs/audit/`; evidence cited per question

## Changelog

- 1.0.1 (2026-07-20) - audit-report invocation wording fixed (never invoked, template reused); performance-frontend added to $ARGUMENTS domains

- 1.0.0 (2026-06-19) - initial versioned release + state-of-the-art enrichment (routing, context, protocol, traps, exit condition)

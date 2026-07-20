---
name: audit-architecture
description: Audit Architecture, Scalability & Availability. Use when auditing ADRs, interface contracts, coupling, scalability, resilience patterns, SLA/RPO/RTO, high availability, or incident management. Triggers on "audit architecture", "audit archi", "audit scalabilité", "audit scalability", "audit disponibilité", "audit availability", "audit résilience", "audit resilience", "audit incidents".
version: 1.0.0
metadata:
  last-reviewed: 2026-06-19
  category: audit
---

# Audit Architecture, Scalability & Availability

> The project variant (`<repo>/.claude/skills/`) wins if it exists: it tools this generic protocol with scripts, datasets and CI gates specific to the repo.

## When ME and not audit-industrialisation

- **ME** when: audit targeted at this domain only
- **audit-industrialisation** instead when: a global multi-domain audit - it orchestrates every audit (ME included) and produces a consolidated report

> For a full project audit, use `audit-industrialisation` rather than invoking each skill separately.

## Overview

Audit a project's architectural maturity: documented decisions, API stability, coupling, resilience patterns, scalability, availability, operational support and incident management. Produces a maturity score (0-4) per question.

**74 questions** split across 7 sections:

| Section | Domain | Questions |
|---------|--------|-----------|
| AR | Architecture, Specification & Deployment | 11 |
| SC | Technical scalability | 7 |
| PA | Fault and interruption tolerance | 15 |
| RE | Recovery after a problem | 13 |
| DI | Availability & SLA | 11 |
| SU | Support & Operability | 8 |
| IM | Incident management | 9 |

The detailed grids (statements, criticality, conditions, verification commands, levels 0-4) live in `reference/` - one file per section.

## Score calculation

- Each scored question is assigned a level from 0 to 4.
- Questions marked **N/A** are excluded from the calculation.
- **Global score** = sum of levels / number of scored questions (excluding N/A).
- Formula: `score = Σ(levels) / count(scored questions)`
- Example: 50 questions scored out of 74, sum = 120 → score = 120/50 = 2.4/4

## Audit protocol

1. **Detect the project type**: backend/API, frontend SPA/PWA, fullstack, library/SDK. Adjust the N/A questions per type (see *Variants* below).
2. **For each section** (AR, SC, PA, RE, DI, SU, IM in this order):
   - Read the matching `reference/<section>.md` file.
   - For each question: run the listed **verification commands**.
   - Assign a **level 0-4** (or **N/A**) in light of the grids, with justification and confidence level.
   - Handle the **conditional questions** (e.g. `AR-01a` is only evaluated if `AR-01 >= 2`): if the condition is not met, mark N/A.
3. **Mark N/A** the questions that do not apply to the project type.
4. **Compute the global score** excluding N/A.
5. **Produce the report** via `audit-report`.

### Variants by project type

**Frontend SPA/PWA** - adapt:
- **SC-01 to SC-07**: PWA offline, service worker, bundle size, CDN, lazy loading. No HPA/K8s.
- **PA-01**: error boundaries (React/Vue), offline fallback, service worker cache, retry on API calls.
- **PA-06**: service worker lifecycle, graceful update.
- **PA-12**: offline fallback, stale-while-revalidate, IndexedDB cache.
- **PA-18 to PA-21**: usually N/A (no frontend DB).
- **RE-01**: retry safety of client-side API calls.
- **DI-01 to DI-09**: CDN availability, service worker health, connectivity detection.
- **IM-01 to IM-09**: error tracking (Sentry), performance monitoring (Web Vitals).

**Library / SDK** - usually N/A: SC-01 to SC-07, PA-05 to PA-09, PA-12, PA-18 to PA-21, RE-05 to RE-08a, DI-01 to DI-09, SU-01 to SU-03, IM-01 to IM-09. Focus on **AR-01** (ADR), **AR-02** (tech debt), **AR-07** (backward compatibility), **AR-08** (deprecation), **AR-09** (semver), **PA-01/PA-03** (retry guidance in the docs).

**Backend / API** - every question applies with the standard grid.

## Grids by section

| Section | File | Description | Questions |
|---------|------|-------------|-----------|
| AR | [reference/ar-architecture.md](reference/ar-architecture.md) | ADR, technical debt, multi-level docs, progressive deployment, feature flags, rollback, compatibility, deprecation, semver | 11 |
| SC | [reference/sc-scalabilite.md](reference/sc-scalabilite.md) | Capacity planning, load testing, auto-scaling, queues/brokers, QoS, partitioning, specialized workers | 7 |
| PA | [reference/pa-pannes.md](reference/pa-pannes.md) | API error handling, retry, circuit breaker, pause, safe shutdown, recovery, isolation, degraded mode, API watch, DB backup/migration | 15 |
| RE | [reference/re-recuperation.md](reference/re-recuperation.md) | Idempotency, idempotency key, replay, data rollback, RTO/RPO, restart/recovery tests, recovery validation, reconciliation | 13 |
| DI | [reference/di-disponibilite.md](reference/di-disponibilite.md) | RPO/RTO, target availability, SLOs/error budget, SLI dashboards, alerts, SLA export, status page, synthetic monitoring | 11 |
| SU | [reference/su-support.md](reference/su-support.md) | Runbooks, L1/L2/L3 escalation, RACI, install scripts, setup time, onboarding | 8 |
| IM | [reference/im-incidents.md](reference/im-incidents.md) | P1-P4 classification, on-call, MTTD, MTTR, communication, incident commander, blameless post-mortem, metrics, automation | 9 |

## Exit condition

- [ ] All 7 sections have been covered (each `reference/<section>.md` read).
- [ ] Every question is scored 0-4 or marked N/A (conditional questions included).
- [ ] Every level rests on evidence from running the verification commands.
- [ ] Global score computed excluding N/A per the formula.
- [ ] Report produced via `audit-report` (summary, per-question detail, strengths/weaknesses, MUST/SHOULD/COULD recommendations, non-auditable items).

## Changelog

- 1.0.0 (2026-06-19) - initial versioned release + state-of-the-art enrichment (routing, context, protocol, traps, exit condition); audit grids in reference/ (progressive disclosure)

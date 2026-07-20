---
name: audit-compliance
description: Compliance, Data Governance & FinOps audit. Use when auditing GDPR compliance, data governance, data retention, consent management, FinOps, or regulatory requirements. Triggers on "audit conformité", "audit compliance", "compliance audit", "audit RGPD", "audit GDPR", "audit données", "audit data governance", "audit finops", "audit gouvernance".
version: 1.0.0
metadata:
  last-reviewed: 2026-06-19
  category: audit
---

## When ME and not audit-industrialisation

- **ME** when: audit targeted at this domain only
- **audit-industrialisation** instead if: global multi-domain audit — it orchestrates every audit (including ME) and produces a consolidated report

> For a full project audit, use `audit-industrialisation` rather than invoking each skill separately.

---

# Compliance, Data Governance & FinOps Audit

## Overview

Audit a project's compliance maturity: GDPR adherence, data governance, consent management, retention, right to erasure, and cloud cost optimization. Covers the CO (Compliance), DG (Data Governance) and FI (FinOps) sections. Produces a maturity score (0-4) per question.

**29 questions** across 3 sections:

| Section | Domain | Questions |
|-------|---------|-----------|
| CO | Compliance & Regulatory (GDPR, retention, consent, right to erasure) | 10 |
| DG | Data Governance (ownership, catalog, quality, classification, lifecycle) | 8 |
| FI | FinOps: Cost Management (monitoring, cache, attribution, waste) | 11 |

## Score calculation

- Each scored question receives a level from 0 to 4.
- Questions marked **N/A** are excluded from the calculation.
- **Overall score** = sum of levels / number of scored questions (excluding N/A).
- Conditional sub-questions (co-02a, co-04a, co-07a, fi-01a, fi-02a, fi-06a) are N/A if their parent question does not reach the required level.

## Audit protocol

1. **Identify the project type**: backend, frontend SPA, fullstack, library, microservices. Mark questions N/A per the variants below.
2. **Section CO — Compliance**:
   - Examine the data model: DB schema, types, identified PII data (CO-01, CO-02)
   - Check anonymization quality if applicable (CO-02a)
   - Look for the retention policy (CO-03)
   - Check the DPIA and risk tracking (CO-04, CO-04a)
   - Examine the purge APIs and propagation (CO-05, CO-06)
   - Check deletion logging and evidence access (CO-07, CO-07a)
3. **Section DG — Data governance**:
   - Check ownership and the catalog (DG-01, DG-02)
   - Examine migrations (DG-03)
   - Look for data contracts (DG-04)
   - Check data-quality monitoring (DG-05)
   - Examine classification of sensitive data (DG-06)
   - Check retention/lifecycle policies (DG-07)
   - Examine data architecture (DG-08)
4. **Section FI — FinOps**:
   - Check cost monitoring and granularity (FI-01, FI-01a)
   - Examine caching and invalidation (FI-02, FI-02a)
   - Look for detection of superfluous calls (FI-03)
   - Check per-customer attribution and reporting (FI-04, FI-05)
   - Examine abuse detection and actions (FI-06, FI-06a)
   - Check waste detection and reservations (FI-07, FI-08)
5. **Run the verification commands** listed for each question
6. **Evaluate the conditional sub-questions**: CO-02a (if CO-02 ≥ 2), CO-04a (if CO-04 ≥ 2), CO-07a (if CO-07 ≥ 2), FI-01a (if FI-01 ≥ 2), FI-02a (if FI-02 ≥ 2), FI-06a (if FI-06 ≥ 2)
7. **Assign a level** per question with justification and confidence level
8. **Mark N/A** the questions not applicable to the project type
9. **Produce the report** in the format below

### Variants by project type

**Frontend SPA/PWA local-first**
- **CO-01**: Adapted — PII data is stored locally (IndexedDB, localStorage). No server transfer = reduced GDPR risk, but the PII is still present client-side.
- **CO-02, CO-02a**: Adapted — consent mainly concerns third-party cookies/trackers.
- **CO-03**: Adapted — retention concerns local storage.
- **CO-04, CO-04a**: Adapted — simplified DPIA if there is no server data.
- **CO-05 to CO-07a**: N/A if there is no backend (no server-side user data).
- **DG-03**: Adapted — migrations concern IndexedDB schemas or local data formats.
- **DG-04 to DG-08**: N/A if there is no backend.
- **FI-01 to FI-08**: N/A if static hosting (CDN, GitHub Pages, Netlify).

**Library / SDK**
- **CO-01 to CO-07a**: N/A — a library does not collect user data directly. Only check that it does not force PII collection in its API.
- **DG-01 to DG-03**: Adapted — ownership concerns the API surface and the changelog. Migrations concern breaking changes to the public API.
- **DG-04 to DG-08**: N/A.
- **FI-01 to FI-08**: N/A.

## Per-section grids

Each grid details, per question: statement, criticality, conditions, bash verification commands and the level tables 0-4.

- [**Section CO — Compliance & Regulatory**](reference/conformite-rgpd.md) — GDPR, anonymization, retention, DPIA, right to erasure, deletion logging (10 questions: CO-01, CO-02, CO-02a, CO-03, CO-04, CO-04a, CO-05, CO-06, CO-07, CO-07a)
- [**Section DG — Data Governance**](reference/gouvernance-donnees.md) — ownership, catalog, migrations, data contracts, quality, classification, lifecycle, Data Mesh (8 questions: DG-01 to DG-08)
- [**Section FI — FinOps**](reference/finops.md) — cost monitoring, cache, batching, per-customer attribution, abuse detection, cloud waste, reservations (11 questions: FI-01, FI-01a, FI-02, FI-02a, FI-03, FI-04, FI-05, FI-06, FI-06a, FI-07, FI-08)

## Output format

```markdown
## Compliance, Data Governance & FinOps — Overall score: X.X/4

### Summary
[2-3 sentences summarizing compliance maturity]

### Section CO — Compliance & Regulatory — Score: X.X/4 (Y questions scored out of 10)

| Code | Question | Criticality | Level | Confidence | Justification |
|------|----------|-----------|--------|-----------|---------------|
| CO-01 | Sensitive data minimized | MUST | X | high/medium/low | ... |
| CO-02 | Anonymization where possible | MUST | X | high/medium/low | ... |
| CO-02a | Anonymization quality | SHOULD | X or N/A | high/medium/low | ... |
| CO-03 | Retention policy | SHOULD | X | high/medium/low | ... |
| CO-04 | DPIA | MUST | X | high/medium/low | ... |
| CO-04a | DPIA risk tracking | SHOULD | X or N/A | high/medium/low | ... |
| CO-05 | Purge API (right to erasure) | MUST | X | high/medium/low | ... |
| CO-06 | Third-party deletion propagation | MUST | X | high/medium/low | ... |
| CO-07 | Deletion logging | MUST | X | high/medium/low | ... |
| CO-07a | Deletion evidence accessibility | SHOULD | X or N/A | high/medium/low | ... |

### Section DG — Data Governance — Score: X.X/4 (Y questions scored out of 8)

| Code | Question | Criticality | Level | Confidence | Justification |
|------|----------|-----------|--------|-----------|---------------|
| DG-01 | Ownership and stewardship | SHOULD | X | high/medium/low | ... |
| DG-02 | Catalog and dictionary | SHOULD | X | high/medium/low | ... |
| DG-03 | Migrations and schema | MUST | X | high/medium/low | ... |
| DG-04 | Data contracts | SHOULD | X | high/medium/low | ... |
| DG-05 | Data-quality monitoring | SHOULD | X | high/medium/low | ... |
| DG-06 | Sensitive-data classification | MUST | X | high/medium/low | ... |
| DG-07 | Retention and lifecycle | MUST | X | high/medium/low | ... |
| DG-08 | Data architecture (Data Mesh) | SHOULD | X | high/medium/low | ... |

### Section FI — FinOps — Score: X.X/4 (Y questions scored out of 11)

| Code | Question | Criticality | Level | Confidence | Justification |
|------|----------|-----------|--------|-----------|---------------|
| FI-01 | Third-party API cost monitoring | SHOULD | X | high/medium/low | ... |
| FI-01a | Cost-tracking granularity | SHOULD | X or N/A | high/medium/low | ... |
| FI-02 | Caching | SHOULD | X | high/medium/low | ... |
| FI-02a | Cache invalidation strategy | SHOULD | X or N/A | high/medium/low | ... |
| FI-03 | Superfluous-call detection | SHOULD | X | high/medium/low | ... |
| FI-04 | Per-customer cost attribution | SHOULD | X | high/medium/low | ... |
| FI-05 | Per-customer consumption reporting | COULD | X | high/medium/low | ... |
| FI-06 | Abuse / abnormal-usage detection | SHOULD | X | high/medium/low | ... |
| FI-06a | Actions on abuse | SHOULD | X or N/A | high/medium/low | ... |
| FI-07 | Cloud-waste detection | SHOULD | X | high/medium/low | ... |
| FI-08 | Commitments and reservations | COULD | X | high/medium/low | ... |

### Strengths
- ...

### Weaknesses
- ...

### Recommendations
1. [MUST] ...
2. [SHOULD] ...
3. [COULD] ...

### Non-auditable items
- [List the aspects impossible to verify through static code analysis: infra access, organizational processes, runtime cloud configuration, etc.]
```

## Exit condition

- [ ] Project type identified, N/A questions marked per the variants
- [ ] All 3 sections (CO, DG, FI) covered, each applicable question scored 0-4
- [ ] Verification commands run for each question
- [ ] Conditional sub-questions evaluated (N/A if parent < required level)
- [ ] Level + confidence + justification provided per question
- [ ] Per-section scores and overall score computed (excluding N/A)
- [ ] Report produced in the format above, including strengths/weaknesses, recommendations and non-auditable items

## Changelog

- 1.0.0 (2026-06-19) — initial versioned release + state-of-the-art enrichment (routing, context, protocol, traps, exit condition); audit grids in reference/ (progressive disclosure)

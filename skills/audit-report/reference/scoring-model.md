# Scoring model — single source of truth

This file is the **canonical** definition of the domain-weight table and the maturity
classification used by the consolidated audit report. It is owned by the `audit-report`
skill and referenced (never copied) by `audit-industrialisation` (Phase 3).

> Any change to the weights or thresholds happens **here only**. No other file duplicates it.

## Domain weights (global score)

The global score is the weighted average of the domain scores. Non-audited (fully-N/A)
domains are excluded from the computation (their weight is ignored).

**Formula**: `global_score = Σ(domain_score × weight) / Σ(weights of the scored domains)`

| Domain | Weight | Rationale |
|---------|-------|---------------|
| Security | 1.5 | Critical impact (data, compliance, reputation) |
| Testing | 1.2 | Foundation of quality, regression prevention |
| CI/CD | 1.0 | Enabler of every practice |
| Observability | 1.0 | Essential to detect production problems |
| Architecture | 1.0 | Long-term structure, maintainability |
| Quality | 1.0 | Day-to-day maintainability |
| Compliance | 1.0 | Legal obligations and governance |
| Frontend Perf | 0.8 | Optional, applicable only if there is significant frontend |

## Domain score

Arithmetic mean of each question's level in the domain. **N/A questions are excluded**
from the denominator.

Example: a domain with 8 questions, 2 of them N/A, scores [2, 3, N/A, 1, 2, 2, N/A, 3]
→ score = (2+3+1+2+2+3) / 6 = 2.17/4.

## Global maturity classification

Based on the adapted CMMI maturity model (levels 0-4).

| Score | Level | Description |
|-------|--------|-------------|
| 0.0 - 0.9 | Initial | Ad hoc practices, no established process |
| 1.0 - 1.9 | Managed | Basic processes in place, reactive |
| 2.0 - 2.9 | Defined | Standardized and documented processes |
| 3.0 - 3.5 | Controlled | Measured and controlled processes |
| 3.6 - 4.0 | Optimized | Continuous improvement, state of the art |

---
paths:
  - "docs/postmortems/**"
version: 1.0.0
metadata:
  last-reviewed: 2026-06-19
---

# DANGER protocol — user-reported P0 regression

A P0 regression **found by a user** (not by CI/E2E/smoke/monitoring) is a **detection failure**: the user must never be the safety net.

## Mandatory handling

1. **Postmortem** using a dedicated "detection gap" template (not the standard one)
2. **Mandatory "Detection gap" section** — analyzing every level that should have caught the bug
3. **Regression test** that **would have caught the bug** — at the right level (SPA navigation, mobile, deployed)
4. **`detection-gap` label** on the originating ticket
5. **Blocking lint**: reject a user-reported postmortem without a "Detection gap" section

## Coverage levels to analyze

| Level | Question |
|-------|----------|
| CI compile/lint | Did the code pass typecheck / lint / clippy? |
| Unit tests | Did a UT cover the broken invariant? |
| E2E tests | Did a scenario reproduce the user flow? |
| Post-deploy smoke | Did the smoke test hit this route? |
| Synthetic monitoring | Did a probe watch this endpoint in prod? |

## Recurring review

Aggregate `detection-gap` tickets to identify **families of gaps** and prioritize coverage investments (E2E, smoke, monitoring).

<!-- Paths to the lint/smoke scripts and the template: to be wired in a project rule. -->

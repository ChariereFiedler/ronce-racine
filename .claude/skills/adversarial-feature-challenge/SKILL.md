---
name: adversarial-feature-challenge
description: Use when a feature is "done" and needs adversarial stress-testing before shipping - "is it really ready", "est-ce vraiment prêt", "find the bugs", "trouve les bugs", "red team", before closing a ticket whose only validation is the golden path passing.
version: 1.1.0
metadata:
  last-reviewed: 2026-07-21
  category: feature
---

# Adversarial feature challenge

> If the current repo has a specific challenge skill (e.g. acme-app → `feature-challenge`), it wins.

## This skill vs. others

- **This skill** when: the feature is announced "done", golden path green, and you want to know what breaks before closing the ticket / shipping
- **`validating-features-end-to-end`** instead if: you first need to prove the intended behavior works (proof before verdict). Validate first, challenge afterward
- **`writing-robust-tests`** if: the goal is to harden coverage, not to hunt flaws by hand

## Principle

- **You try to break, not to validate.** 0 bugs found = a bad challenge, not a perfect feature - start over with another persona
- **Proof mandatory**: every flaw = a documented reproduction (steps + curl/SQL/screenshot output), no offhand claims
- The natural reflex covers backend security and edge cases well; **the systematically forgotten angles are UX, accessibility and non-technical personas** - hence the checklist

## Context to gather (before acting)

- The ticket/spec: what is the expected behavior and the business limits (thresholds, quotas, roles) to attack
- How to start the app and call the API (project dev commands) - a challenge without a running app proves nothing
- Multi-tenant / authorization model: 2 accounts from 2 tenants to test cross-tenant leaks
- Real surface: endpoints, forms, async jobs touched by the feature

## Protocol

1. **Pick a persona** (table below) and attack the feature from its point of view - don't validate, break
2. **Walk the layers**: go through every block of the checklist, inject `assets/fuzz-payloads.txt` into the inputs
3. **Document each flaw** in `templates/challenge-report.md`: repro steps + output (curl/SQL/screenshot) + severity
4. **Switch persona** and start over - 0 bugs = insufficient challenge, not a perfect feature. **Stopping after one persona is not a challenge**: the first persona finds what you already suspected, the second finds what you did not. Name each persona explicitly in the report as you go, so the count is visible.
5. **Verdict + tickets**: one ticket per confirmed flaw, rule blocking / improvement / green-light

## Traps & rationalizations

| Excuse | Reality |
|--------|---------|
| "Found nothing, it's solid" | 0 bugs = a bad challenge. Switch persona and angle (UX, a11y, non-tech) |
| "The golden path passes, we're good" | The golden path is exactly what you do NOT challenge. Attack the edges |
| "This case will never happen in prod" | Double-click, reload mid-flow, 2 tabs: it happens on day 1. Reproduce it |
| "It's just a cosmetic bug" | Note the severity in the report, don't decide to discard on the PO's behalf |
| "I describe the flaw, no need to repro" | Without steps + output, it's an opinion. An archivable repro or it doesn't exist |

## Tooling

- `templates/challenge-report.md` - full checklist to tick + flaws table + verdict, filled in during the challenge
- `assets/fuzz-payloads.txt` - ready-to-inject payloads (SQLi, XSS, Unicode, numeric bounds, dates, tricky emails)

## Checklist by layer

**UX & interactions**: double-click submit (idempotence), back/reload mid-flow, close while saving, buttons disabled during loading, empty state (0 items), saturated state (10k+), zoom 200%/50%, mobile (touch targets)

**Inputs**: empty/null, edge whitespace, Unicode (emoji, RTL), 10,000+ char string, SQL/XSS injection, path traversal, numbers (0, negative, MAX, NaN), extreme dates, IDs (other tenant, nonexistent, malformed)

**Auth & multi-tenant**: session expired mid-action, another tenant's token → strict 403/404, shared URL cross-tenant → 404 not 200, role downgrade mid-session, CSRF on destructive actions

**Concurrency**: 2 users editing the same object, deletion during edit, business invariants under simultaneous requests

**Network & state**: connection drop during submit (retry? idempotence?), high latency, API 500 → degraded UX, 200 payload but empty/malformed

**Data**: deletion of a referenced entity (cascade/orphans), modification during a long async process, threshold/quota bounds

**Accessibility**: 100% keyboard navigation, visible focus, labels on icon buttons, contrast, screen reader

**Observability**: logs on each key action (no PII), metrics, is the error visible in a dashboard?

## Personas to walk through

| Persona | Focus |
|---|---|
| Distracted novice | Clicks everything, reads nothing, mobile |
| Power user | Shortcuts, multiple tabs, automation |
| Malicious | Injection, cross-tenant, rate limit |
| Blind user | Screen reader, no mouse |
| Curious dev | DevTools, localStorage, replayed requests |

## Exit condition

- [ ] At least 2 personas walked through (one of them non-technical) - **no feature is OK without ≥ 1 challenge round**
- [ ] Each checklist layer walked or explicitly waived (justified out-of-scope)
- [ ] Each flaw = archived repro (steps + output) + severity in `templates/challenge-report.md`
- [ ] One ticket opened per confirmed flaw
- [ ] Verdict set: blocking / improvement required / green-light

## Changelog

- 1.1.0 (2026-07-21) - persona switch made explicit and countable; eval runs showed agents stopping after one

- 1.0.0 (2026-06-19) - initial versioned release + state-of-the-art enrichment (routing, context, protocol, traps, exit condition)

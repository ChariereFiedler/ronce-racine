---
name: production-incident-diagnostic
description: Use when diagnosing a production incident - "prod is down", "la prod est down", an API responding 502/500/slow, abnormal behavior in prod, a user reporting something broken in production, alerting gone silent. Triggers on localizing the faulty layer of a live system.
version: 1.0.0
metadata:
  last-reviewed: 2026-06-19
  category: process
---

# Production incident triage - from symptom to faulty layer

> If the current repo has a specific prod-diagnostic skill (e.g. acme-app → `production-diagnostic`), it wins - it knows the hosting, the observability tool, the endpoints and the project tracker.

## This skill vs. others

- **This skill** when: a **production** incident - prod down, API misbehaving (502/503/500/slow), abnormal behavior in prod, user report, silent alerting
- **`ci-pipeline-orchestration`** instead if: the CI pipeline is red but **prod runs normally** (build/release problem, not a live incident)
- **`recurring-bug-root-cause`** instead if: a bug that **recurs** (2+ similar fixes) - class hunting, not a live incident
- **`detection-sweep`** instead if: hunting **static** code problems across the whole project, outside an incident

> Quick rule: prod reachable but misbehaving → this skill; pipeline red, prod OK → ci-pipeline-orchestration.

## Principle

**Isolate the layer before fixing.** An incident is traversed layer by layer - hosting/deployment → backend/API → alerting → frontend - until the faulty one is located. **Evidence before conclusion**: never "it's probably X" without a log, metric, trace or reproduction. The output = faulty layer + supported root cause + mitigation, not a blind restart.

## Context to gather (before acting)

- **Scope**: is everything affected, or one endpoint / one feature / a subset of users?
- **Since when**: timestamp of the first symptom; does it correlate with a deployment, a migration, a traffic spike?
- **Suspected layer** from the symptom (see triage table)
- **Access**: health endpoint URLs, access to logs / metrics / traces (observability tool, dashboard), status of the last deployment, read-only DB access
- Project conventions: deploy/rollback commands, tracker for the incident ticket

## Protocol

### 1. Quick triage - categorize the symptom
- Reproduce the symptom (curl the endpoint, user journey) and note the exact code/behavior
- Hit the **health endpoint** (liveness/readiness) if exposed

| Symptom | Likely layer |
|---------|--------------|
| 502/503 | Hosting / process down / reverse proxy |
| Health 200 but 500 on endpoints | Partial backend (DB, external dependency) |
| Abnormal latency, timeouts | Saturation (DB pool, CPU, queue) |
| Blocked job/worker | Crashed worker or deadlock |
| Silent alerting | Channel config / rate limiting |
| Blank page, asset 404s | Corrupted frontend build/deploy, cache/CDN |
| Errors specific to one user | Auth / permissions / data |

### 2. Check deployment & version
- **What version is actually running in prod?** Compare to the expected commit (a "deploy success" serving the old image is a classic)
- Last deployment / migration: timing vs incident start → rollback candidate

### 3. Logs
- Filter the observability tool on the incident window and the suspected layer
- Look for: crash/panic/exception, OOM, "too many connections", exhausted descriptors, external dependency errors

### 4. Metrics & alerts
- Dashboard: CPU/memory, error rate, p95/p99 latency, connection pool saturation, queue depth
- Should an alert have fired? If not, an observability gap to track too

### 5. Traces
- If distributed tracing available: follow a faulty request end-to-end to locate the slow/failed hop

### 6. Layer bisection
- Confirm/rule out each layer with evidence (health responds → process up; direct DB query responds → DB up). Descend to the layer that faults.

### 7. Root cause + mitigation
- State the **supported** root cause (log/trace/repro). Decide mitigation: rollback (fast, reversible) vs forward-fix - when in doubt, ask the user
- Any destructive action in prod (UPDATE/DELETE, restart, purge): **explicit user confirmation**, read-only access by default

## Templates

- `templates/incident-report.md` - incident report (timeline, layer, evidence, root cause, mitigation, follow-up)

## Traps & rationalizations

| Excuse | Reality |
|--------|---------|
| "I'll restart, it'll come back" | A restart without diagnosis erases the evidence and hides a cause that will return. Capture logs/metrics first. |
| "The symptom is gone, it's fixed" | Fixing a symptom without a root cause = an incident that replays. No closure without a supported cause. |
| "It's probably the DB / the network" | Unproven hypothesis. One piece of evidence per layer, otherwise you treat the wrong one. |
| "The deploy is green, prod is up to date" | Verify the version actually served - a green deploy can serve the old image. |
| "I'll write up the incident later" | "Later" never comes. Report + ticket before closure. |

## Exit condition

- [ ] Symptom reproduced and scope delimited
- [ ] Faulty layer isolated with at least one piece of evidence (log, metric, trace or repro)
- [ ] Root cause documented - never an unproven hypothesis
- [ ] Mitigation applied or planned; destructive actions confirmed by the user
- [ ] Prod re-checked: health endpoint OK and symptom gone (output pasted)
- [ ] Incident report written + ticket created if prod was impacted

## Tooling

- `templates/incident-report.md` - report template to fill in
- Generic tools: `curl -v`/`-I` on health endpoints, query the observability dashboard over the window, read-only DB query, trace following

## Changelog

- 1.0.0 (2026-06-19) - initial version, derived from a project workflow decanted of all infra coupling

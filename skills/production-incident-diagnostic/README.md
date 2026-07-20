# `production-incident-diagnostic`

> Traverse a live incident layer by layer — hosting, backend, alerting, frontend — and isolate the faulty one with evidence before touching anything. Never a blind restart.

| | |
|---|---|
| **Type** | Skill (on-demand workflow) |
| **Category** | `process` |
| **Artifact** | [`SKILL.md`](SKILL.md) |
| **Tooling** | [`templates/incident-report.md`](templates/incident-report.md) · generic (`curl`, dashboard, read-only DB, tracing) |

## What it is

`production-incident-diagnostic` is a triage protocol for **live production incidents**. It moves methodically from symptom to faulty layer: reproduce, categorize, check the running version, read logs, read metrics, follow traces, bisect layer by layer, and only then state a supported root cause and choose a mitigation. Its output is never a blind restart — it is a located layer, an evidenced cause, and a deliberate fix.

It is infra-agnostic. When the current repo has its own prod-diagnostic skill that knows the hosting and observability stack, that one wins.

## Why it exists

Under incident pressure, the instinct is to act before understanding — restart the process, blame "the database", declare it fixed when the symptom disappears. Each of these destroys evidence or masks a cause that will return:

- **A restart before diagnosis** erases the logs and metrics that would have pinned the cause.
- **An unproven "it's probably the network"** sends the fix at the wrong layer.
- **A vanished symptom** without a root cause is an incident that will replay.
- **A green deploy** can still be serving the old image — the version actually running must be verified, not assumed.

The skill enforces the opposite reflex: **evidence before conclusion**, one proof per layer, and read-only access by default with explicit confirmation for any destructive action.

## When it triggers

Invoke it when diagnosing a production incident:

- "prod is down", an API responding 502/503/500 or slow, abnormal behavior in prod
- a user reporting something broken in production
- alerting gone silent

Quick disambiguation: prod reachable but misbehaving → this skill. Pipeline red but prod fine → `ci-pipeline-orchestration`. A bug that recurs (2+ similar fixes) → [`recurring-bug-root-cause`](../recurring-bug-root-cause/). Static code problems across the project, outside any incident → [`detection-sweep`](../detection-sweep/).

## How it works

The skill descends the stack layer by layer — quick triage and symptom categorization, the version actually running, logs, metrics and alerts, traces, then bisection — accumulating one piece of evidence per layer until the faulty one is isolated. Only then does it state a supported root cause and choose a mitigation (rollback vs forward-fix), with read-only access by default and explicit confirmation for any destructive action.

Full step-by-step protocol → [`SKILL.md`](SKILL.md).

### Record the incident

[`templates/incident-report.md`](templates/incident-report.md) captures scope, faulty layer, timeline, evidence, root cause, mitigation, and follow-up tickets (including any missing observability that failed to alert).

## Worked example

> "The API is returning 502s."

1. **Triage**: `curl -I` the health endpoint → also 502. Table says hosting / process down.
2. **Version**: the last deploy is 10 minutes old and marked success — but the running container is on the *previous* image (a known "green deploy, old image" trap).
3. **Logs**: the new process crash-loops on startup with a missing env var.
4. **Bisection**: reverse proxy up, app process down → hosting/deploy layer confirmed.
5. **Root cause**: the release introduced a required config value never set in prod.
6. **Mitigation**: rollback (fast, reversible), then add the missing variable and re-deploy. Health endpoint re-checked OK, output pasted. Incident report written, follow-up ticket to add a startup-config check.

## Related artifacts

- [`recurring-bug-root-cause`](../recurring-bug-root-cause/) — for a bug class that keeps coming back, not a live incident.
- [`detection-sweep`](../detection-sweep/) — for static problem-hunting across the whole project.

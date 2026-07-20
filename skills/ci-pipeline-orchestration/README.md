# `ci-pipeline-orchestration`

> Drive a CI pipeline end-to-end after a push: read its status, diagnose failures to a cause, rerun only genuine flakes, and validate the deploy actually responds.

| | |
|---|---|
| **Type** | Skill (on-demand workflow) |
| **Category** | `process` |
| **Artifact** | [`SKILL.md`](SKILL.md) |
| **Tooling** | The CI provider's own CLI/API (`gh run`, `glab ci`, REST) — detected per project |

## What it is

`ci-pipeline-orchestration` is the discipline of **owning what happens after `git push`** until the change is proven live. It spans the full arc: the pipeline's job statuses, the diagnosis of any red job, the decision to fix or rerun, and the post-deploy validation that the deployed app actually answers with the right status and headers.

It is deliberately **provider-agnostic**. It does not assume GitLab, GitHub Actions, Jenkins or any single CI; it tells the agent to find the available command or config first, then act.

## Why it exists

Two failure modes waste the most time on CI, and this skill exists to block both:

1. **The blind rerun.** A job goes red, someone hits "retry" hoping it passes. If the failure was a real bug, the rerun masks it and burns runner minutes; if it recurs, nobody ever tracks it. The skill forces a **diagnosis-to-cause** step before any rerun, and escalates a failure seen 2+ times to a ticket.
2. **The false green.** A pipeline turns green and everyone assumes the app is deployed and healthy. But a green build says nothing about whether the running service responds. The skill makes a **smoke test + HTTP header check** part of "done".

## When it triggers

- After any `git push`, to check the resulting pipeline
- CI is red and the failure needs diagnosing
- Jobs need retrying
- Validating post-deploy HTTP headers or running a smoke test

Trigger phrases: "check the pipeline", "rerun CI", "the pipeline failed", "validate the headers".

Route elsewhere when: the errors are still local and **unpushed** (→ [`commit-readiness-review`](../commit-readiness-review/)); or production is broken **outside** an in-progress deploy, which is an incident (→ [`production-incident-diagnostic`](../production-incident-diagnostic/)).

## How it works

The skill owns everything after `git push` until the change is proven live: read the pipeline status for the target commit, diagnose each red job to a *cause* rather than a symptom, then either fix-and-repush or rerun only a confirmed infra flake — never a reproducible red test. A green pipeline is not the finish line: it closes with a smoke test and an HTTP-header check on the deployed app, and escalates any failure seen 2+ times to a ticket instead of rerunning again. Manual deploy jobs always need explicit user confirmation, and `--no-verify` is never used to get past a hook.

Full step-by-step protocol (including the symptom→cause table and the exact headers to check) → [`SKILL.md`](SKILL.md).

## Worked example

> You push a fix to `acme-app`. The pipeline goes red on the `test` job.

1. **Status**: list runs for the pushed SHA — `build` passed, `test` failed, `deploy` is manual.
2. **Diagnose**: read the tail of the `test` logs. The failure reproduces locally → it is a regression, not a flake.
3. **Act**: fix the code on the branch, repush. The pipeline re-triggers and goes green.
4. **Post-deploy**: the `deploy` job is manual — ask the user before triggering it. After deploy, `curl -I https://acme-app.example/health` returns 200 with HSTS and `nosniff` present. Smoke test passes.
5. **Report** with the template, pasting the real header output.

## Related artifacts

- [`commit-readiness-review`](../commit-readiness-review/) — local checks before the push that feeds the pipeline.
- [`production-incident-diagnostic`](../production-incident-diagnostic/) — prod broken outside a deploy is an incident, not this.

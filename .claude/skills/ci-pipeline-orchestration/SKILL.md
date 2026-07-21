---
name: ci-pipeline-orchestration
description: Use when a CI pipeline needs checking after a push, when CI is red and the failure must be diagnosed, when jobs need retrying, or when validating post-deploy HTTP headers and smoke tests. Triggers on "check the pipeline", "vérifier le pipeline", "rerun CI", "relancer CI", "the pipeline failed", "le pipeline a échoué", "validate the headers", "valider les headers", after any `git push`.
version: 1.0.0
metadata:
  last-reviewed: 2026-06-19
  category: process
---

# CI Pipeline Orchestration - drive the pipeline end-to-end after a push

> If the current repo has a project-specific pipeline skill (e.g. acme-app → `pipeline-orchestration`), it wins - it knows the CI provider, its commands and the deploy URLs.

## This skill vs. others

- **This skill** when: a push happened and the CI pipeline must be checked, diagnosed, retried, or its post-deploy validated - CI red, job reruns, HTTP header checks
- **`commit-readiness-review`** instead if: the errors are local and the code is **not pushed yet** (pre-commit checks)
- **`production-incident-diagnostic`** instead if: production is down or misbehaving outside of an in-progress deploy - that is an incident, not the pipeline

> Quick rule: red pipeline after a push → this skill; local errors before push → `commit-readiness-review`; prod broken outside a deploy → incident diagnostic.

## Principle

- **End-to-end**: from pipeline status through post-deploy validation (HTTP headers, smoke test) - a green pipeline does not prove the app responds.
- **Diagnose before rerunning**: map the failure to a precise cause. Blind reruns mask a real bug and burn runner minutes.
- **Track the recurring**: the same failure 2+ times = a ticket, not yet another rerun.

## Context to gather (before acting)

- **Which CI provider** and how to query it: GitLab CI, GitHub Actions, Jenkins, CircleCI… available CLI (`gh run`, `glab ci`, API), or config (`.gitlab-ci.yml`, `.github/workflows/`, `Jenkinsfile`)
- **Which commit / branch** should carry the target pipeline (the pushed SHA, not an old one)
- **CI access**: token/credentials available to read job status and logs
- **Post-deploy URL** (staging/prod) and healthcheck endpoint for validation
- Read an existing neighbor/project skill and copy its commands before inventing

## Protocol

```
- [ ] 1. Pipeline status of the target commit
- [ ] 2. If failed → diagnose (failed job logs) → map to a cause
- [ ] 3. Fix (push) OR targeted rerun if a genuine flake
- [ ] 4. Post-deploy: smoke test + HTTP headers
- [ ] 5. Recurring failure (2+) → ticket
```

1. **Current status** - list the latest pipelines/runs and fetch the job statuses for the target commit. Identify what is `passed`, `failed`, `running`, `manual`.
2. **Diagnosis** - for each `failed` job, read the tail of the logs and map it to a **cause**, not just a symptom:

   | Symptom in the logs | Likely cause → action |
   |------------------------|--------------------------|
   | lint/format diff | reformat + fix locally, repush |
   | red test | analyze the failing test (regression vs flake) before any retry |
   | build/compile error | reproduce the build locally, fix, repush |
   | runner infra error / network timeout / image pull | infra flake → legitimate rerun with no code fix |
   | missing secret/variable | CI config to fix, not the code |

3. **Act**:
   - **Real bug**: fix on a branch, repush - the pipeline re-triggers. No rerun without a fix.
   - **Confirmed infra flake** (runner system failure, network timeout): rerun the targeted job. Document the rerun.
   - **Manual deploy job**: **ask the user to confirm** before triggering it, especially toward production.
   - **Never** `--no-verify` on push even if a hook fails.
4. **Post-deploy** - a green pipeline is not enough:
   - **Smoke test**: call the healthcheck / key endpoint, verify a real 2xx.
   - **HTTP headers** (`curl -I <url>/health`):
     - `Strict-Transport-Security` present in prod
     - `X-Content-Type-Options: nosniff`
     - `Cache-Control` consistent (no aggressive caching on an API)
     - `Access-Control-Allow-Origin` = expected domain
   - App not responding despite a green pipeline → read the deploy logs before declaring success.
5. **Recurrence** - the same failure 2+ times → create a CI bug ticket (logs + context + criterion "the job passes on the default branch") instead of rerunning an Nth time.

## Templates

```
Pipeline <id> (<branch>, <sha>): <status>
- Job <a>: ✅/❌ (+ cause if ❌)
- Job <b>: ✅/❌ (+ cause if ❌)
- Smoke test: ✅/❌
- Headers: ✅/❌ (+ detail if KO)
- Action: <fix pushed | flake rerun documented | deploy validated | ticket created>
```

## Traps & rationalizations

| Excuse | Reality |
|--------|---------|
| "I'll rerun, maybe it passes" | Rerunning without diagnosing masks a real bug and burns runner minutes. Diagnose first |
| "It's probably a flake" | "Flake" is not a decree: a genuine flake = an identified infra error (runner, network). A reproducible red test is not a flake |
| "This job fails often, I ignore it" | An ignored recurring failure = debt that will make the pipeline useless. 2+ times → ticket |
| "Pipeline green, it's deployed" | A green job does not prove the app responds. Smoke test + headers mandatory |
| "The hook blocks the push, `--no-verify`" | The hook protects the branch. No `--no-verify` without an explicit request |
| "I'll trigger the manual deploy directly" | Manual job = user confirmation, especially toward prod |

## Exit condition

- [ ] Target commit's pipeline `passed` or `running` (no longer `failed`)
- [ ] If a fix: commit pushed and a new pipeline triggered
- [ ] If a flake: rerun launched and result documented
- [ ] Post-deploy validated: smoke test 2xx + conformant headers (output pasted, not assumed)
- [ ] If a recurring failure (2+): ticket created

Pipeline still `failed` with no ticket and no fix = not done.

## Tooling

- The CI provider's CLI depending on the project (`gh run view/rerun`, `glab ci`, REST API) - spot the available command before acting, do not hardcode a single provider.

## Changelog

- 1.0.0 (2026-06-19) - initial version, derived from a project workflow and decoupled from the CI provider

# The full catalog

Every skill that ships, grouped by what you are doing when it fires. The README
keeps five of them; this is the complete list.

A skill is loaded on demand: its `description` carries trigger phrases, and the
agent picks it from what you asked for. None of them is a command you type.

For the always-on rules and the hooks, see the README, which lists both in full.

## Designing, before any code is written

| Skill | Why you would want it |
|---|---|
| `domain-modeling-design` | settles aggregates, invariants and where logic belongs, deliberately before implementation |
| `domain-glossary` | one name per concept in a `GLOSSARY.md`, with the rejected synonyms recorded so a search still lands right |
| `frontend-spec-call-site-audit` | reads the real call sites before a UI ticket is written, so the spec covers what exists |
| `comprehensive-test-strategy` | a coverage matrix by risk, to decide what deserves which test level |
| `recording-decisions` | captures a counter-intuitive choice while the reason is still in someone's head |

## Implementing

| Skill | Why you would want it |
|---|---|
| `ddd-backend-implementation` | keeps validation, business logic and I/O in the layer that owns them |
| `frontend-fullstack-implementation` | structures types, state, logic and UI, and refuses to ship without loading/error/empty/success states |
| `design-system-component-lifecycle` | extends the design system instead of adding the fourth one-off variant of the same button |
| `api-contract-versioning` | turns a field rename into a migration path rather than a break for the consumers |
| `database-schema-evolution` | plans a risky or zero-downtime schema change before running it |
| `refactoring-shared-component-api` | finds every call site of a shared contract, including the ones a typecheck stays quiet about |

## Testing and validating

| Skill | Why you would want it |
|---|---|
| `writing-robust-tests` | tests you have seen fail before they pass, with no hard waits and no fragile locators |
| `validating-features-end-to-end` | exercises the feature for real and pastes the evidence, instead of "the unit tests are green" |
| `adversarial-feature-challenge` | attacks a finished feature from several personas; zero flaws found means a bad challenge, not a perfect feature |
| `visual-regression-check` | looks at the actual rendering on desktop and mobile before the commit |

## Fixing a bug

| Skill | Why you would want it |
|---|---|
| `bug-triage-structured` | reproduction, root cause with `file:line`, then an argued fix-now-or-ticket decision |
| `recurring-bug-root-cause` | when the same class of bug returns, stops treating the symptom and puts a guardrail in |
| `bug-ticket-root-cause` | a ticket carrying the cause and a red-then-green confirmation test, not just the symptom |
| `production-incident-diagnostic` | localizes the failing layer of a live system under time pressure |
| `performance-profiling` | measures the noise floor first, then profiles, with "inconclusive" as a valid answer |

## Reviewing and shipping

| Skill | Why you would want it |
|---|---|
| `commit-readiness-review` | scans the staged diff for secrets, debug leftovers and disabled tests before anything is written |
| `merge-request-review` | reviews someone else's branch diff against intent, not just against style |
| `ci-pipeline-orchestration` | checks, diagnoses and retries a pipeline after a push, and validates the deployed headers |
| `qa-session-intake` | turns a recorded QA session (remarks, screenshots, network errors) into triaged tickets |

## Sweeping and auditing

| Skill | Why you would want it |
|---|---|
| `detection-sweep` | a whole-project health check, for a periodic pass or before a release |
| `daily-workflow-optimization` | reviews recurring friction and cuts the repeated manual steps |
| `audit-industrialisation` | heavyweight and opt-in: orchestrates the 8 domain audits below and consolidates them |
| `audit-report` | the template and scoring rules for that consolidated report |

The 8 domains, each usable on its own: `audit-architecture` ·
`audit-ci-cd` · `audit-compliance` · `audit-observability` ·
`audit-performance-frontend` · `audit-quality` · `audit-security` ·
`audit-testing`.

The audit family is the heavy end of the catalog. It is opt-in for a reason:
it is meant for a periodic review of an existing project, not for a working day.

## Notes

Some skills embed read-only detection `scripts/` and `reference/` files, loaded
only when the skill itself fires, so they cost nothing until they are needed.

A project-specific skill, coupled to your stack and your tracker, takes
precedence over its generic version here. Every generic skill says so up front.

How a skill is written and proven: [`writing-a-skill.md`](writing-a-skill.md) ·
[`quality-bar.md`](quality-bar.md).

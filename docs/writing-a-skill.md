# Writing a canonical skill

## Admission criterion: is it truly generic?

Same criteria as for a rule ([writing-a-rule.md](writing-a-rule.md)). A skill belongs here **only** if it contains **no**:

- crate, package, module, directory, or script name of a specific project;
- imposed tracker (GitLab/Jira/GitHub hardcoded), project identifier format;
- stack imposed by a single project (Axum, Nuxt, Supabase RLS…).

If the workflow is useful but coupled, **split it**: the generic *protocol* comes here, the *tooled how* (project scripts, golden dataset, CI gates) stays in a project skill `<repo>/.claude/skills/`. Each generic skill notes up front that the project variant takes precedence.

## What a complete skill looks like

Every file below is required by a CI gate. A skill missing one of them fails `npm test`.

```
skills/<name>/
  SKILL.md          the skill itself (contract below)
  README.md         human-facing page: what it is, when it fires, how it is verified
  eval.yaml         behavioral evaluation manifest (see below)
  scripts/<x>.ts        optional: deterministic detection script
  scripts/<x>.test.ts   REQUIRED if scripts/<x>.ts exists
  reference/*.md        optional: heavy material (progressive disclosure)
  templates/*.md        optional: output templates
```

Ready-to-copy skeleton: [`templates/SKILL.template.md`](templates/SKILL.template.md).

## 1. SKILL.md contract

**Frontmatter** (`version` and `metadata` are fields supported by the [agentskills.io](https://agentskills.io/specification) spec):

```yaml
---
name: kebab-case
description: Use when <third-person triggers, symptoms, verbatims>
version: 1.0.0
metadata:
  last-reviewed: YYYY-MM-DD
  category: audit | feature | bug | frontend | test | process
---
```

- `description`: starts with "Use when", **third person** (never "I/you"), describes WHEN not HOW - never summarize the workflow in it (the agent would follow the summary instead of reading the skill).
- **Quoted triggers, bilingual**: the description must contain the invocation phrases in quotes, in **English and French**. They are what routes a request to this skill, and `tools/skills.ts triggers` lints them: each quoted trigger must rank its own skill in the top 3 against all others. A trigger too generic to discriminate fails CI.
  ```
  Triggers on "run a sweep", "detect the problems", "lance un sweep", "détecte les problèmes"
  ```
- `version`: semver. Bump **patch** for a clarification, **minor** for an added section, **major** for a protocol change.
- `metadata.last-reviewed`: date of the last review; `category` from the closed list.

**Body - standard sections** (omit an irrelevant section, never fill it empty):

1. Title + principle · 2. Routing "When ME and not X" · 3. Context to gather · 4. Protocol · 5. Templates · 6. Pitfalls & rationalizations · 7. Exit condition · 8. Tooling · 9. Changelog.

The **Exit condition** section carries more weight than the rest: it is what the evaluation harness gates on. Write it as a checklist of *observable* outcomes (a file produced, a grep that returns nothing, an output pasted), not intentions.

## 2. eval.yaml: proving the skill still works

Prose is not testable by a linter, so every skill declares how an agent following it should be judged. Full guide: [evaluating-skills.md](evaluating-skills.md).

```yaml
fixture: flawed-app            # a playground fixture (playground/setup.ts)
prompt: >                      # what a user would naturally ask
  Run a detection sweep on this project.
gates:                         # mechanical, reproducible
  - repo_clean: { except: "REPORT.md" }
  - file_exists: "REPORT.md"
judge:                         # optional, for what stays subjective
  criteria:
    - "Findings are grouped by cause, not occurrence"
  threshold: pass_all
```

Three rules, each learned from a real run that failed for the wrong reason:

- **Derive gates from your own Exit condition section**, never from intuition about what "clean" means. A skill that legitimately writes files must list them in `repo_clean`'s `except` - otherwise the manifest punishes an agent for obeying the skill.
- **`repo_clean` is for read-only skills only.** For a skill that builds
  something, you cannot enumerate upfront what an agent will legitimately
  produce (tests, configs, adapters, a CI job, probe scripts): every run
  surfaces a new file and the except list never converges. Gate the skill's
  **invariant** instead - what must NOT happen. Examples that work: a challenge
  skill must not fix the feature it attacks (`grep_zero` on validation added to
  the target), a DDD skill must not invert its dependency direction
  (`grep_zero` on infrastructure imports inside the domain), a bug skill must
  actually remove the bug (`grep_zero` on the planted defect).
- **Judge criteria are short one-liners** (~12 words). The anti-leniency parser makes the judge echo each criterion verbatim; long ones get paraphrased and the run errors out.
- **Numeric `grep_count` gates are computed against the fixture, never guessed.** Over agent-authored content the exact count is unknowable: use `grep_min` (a floor) instead. Same reflex for file names - do not gate on `foo.test.js` when the project convention might be `foo.spec.js`.

Validate with `npm run eval:dry` (no agent call, no network). A real run costs API tokens: `npx tsx tools/eval.ts run --only <name>`.

## 3. Scripts and their test procedure

A deterministic detection command belongs in `scripts/` ("Run `scripts/x.ts`") rather than inline prose: more reliable, saves context. Any script **must** ship a co-located `scripts/<x>.test.ts` exercising a positive AND a negative fixture, and a matching entry in [`tools/mutations.ts`](../tools/mutations.ts) so a test that cannot fail is caught.

## Applied best practices

- **Concise**: SKILL.md body < 500 lines. Beyond that → progressive disclosure: move heavy references (grids, APIs) into `reference/*.md` with a table of contents at the top.
- **Reference depth ≤ 1**: all links start from the SKILL.md, never from a nested reference.
- **Output templates** in `templates/`, pitfalls in an Excuse → Reality table, exit condition as a checklist.

## Validation before opening a PR

```bash
npm test              # structure, bilingual trigger routing, versioning, behavioral tests
npm run typecheck
npm run test:mutation # every declared mutation must turn its tests red
npm run eval:dry      # every eval.yaml parses and names an existing fixture
```

All four run in CI. The harness fails (exit 1) on any drift from the contract.

## After adding / modifying

1. Bump `version` + `last-reviewed`, add a line to the `## Changelog`.
2. Update the skills table in the [README](../README.md).
3. The four commands above, green.

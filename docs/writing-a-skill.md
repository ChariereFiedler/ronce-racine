# Writing a canonical skill

## Admission criterion: is it truly generic?

Same criteria as for a rule ([writing-a-rule.md](writing-a-rule.md)). A skill belongs here **only** if it contains **no**:

- crate, package, module, directory, or script name of a specific project;
- imposed tracker (GitLab/Jira/GitHub hardcoded), project identifier format;
- stack imposed by a single project (Axum, Nuxt, Supabase RLS…).

If the workflow is useful but coupled, **split it**: the generic *protocol* comes here, the *tooled how* (project scripts, golden dataset, CI gates) stays in a project skill `<repo>/.claude/skills/`. Each generic skill notes up front that the project variant takes precedence.

## What a complete skill looks like

`SKILL.md` and `README.md` are required by `npm test` (`tools/skills.ts validate`),
and a `scripts/<x>.ts` without its `scripts/<x>.test.ts` fails the same command.
`eval.yaml` is validated by `npm run eval:dry`, a step of the Validate CI job:
a skill that ships without one is skipped rather than reported, so adding it is
on you. Its `preconditions:`/`gates:` split is enforced by `npm run eval:lint`,
which runs as part of `npm test`.

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

1. Title + principle · 2. Routing "When ME and not X" · 3. Context to gather · 4. Protocol · 5. Templates · 6. Pitfalls & rationalizations · 7. Exit condition · 8. Tooling.

### Which section feeds which eval dimension

Five of these sections are now graded, not one, and each is graded through a
different mechanism. Write the section knowing what will read it, and the skill
and its eval stop drifting apart:

| Section you write | Dimension | What reads it | So write it as |
|---|---|---|---|
| `Exit condition` | **outcome** | in-container gates, on the tree the agent left | observable outcomes: a file produced, a grep that returns nothing |
| `Tooling` | **tooling** | a `tool_used` trajectory check | a NAMED command or script, not "investigate the history" |
| `Context to gather (before acting)` | **sequence** | a `before` / `read_file` trajectory check | the artefact to open, by path or command, and what it must precede |
| `Protocol` / `Steps` | **sequence** | a `before` check per ordered pair | steps whose order is an ACT ordering, not a narrative one |
| `Pitfalls & rationalizations` | **trap** | a judge criterion tagged `trap` | Excuse → Reality, the excuse phrased as the agent would think it |
| `Guardrails`, forbidden acts | **restraint** | a `tool_absent` check, or a `grep_zero` gate | the act itself: "never commit", not "be careful about committing" |

The **Exit condition** section still carries more weight than the rest: it is
the only one graded on the repository, and a promise stated there that no grep
can reach is a promise nothing measures. Write it as a checklist of *observable*
outcomes, not intentions.

Two consequences worth internalising, both learned the expensive way:

- **A prescription with no named act cannot be graded at all.** "Gather the
  relevant context" is unreadable by any check; "run `git log --oneline -20` on
  the failing scope" is a `tool_used` and half a `before`. The rewrite is right
  for the reader too, which is the test of whether the edit was legitimate.
- **A section your skill does not really have should stay absent.** Several
  scenarios in the base ship no trajectory checks because the skill genuinely
  prescribes no act - `recording-decisions` opens its `## Tooling` with "No
  script: essentially a human decision". A check nobody can pass reddens both
  arms and separates neither, which is worse than no check.

## 2. eval.yaml: proving the skill still works

Prose is not testable by a linter, so every skill declares how an agent following it should be judged. Full guide: [evaluating-skills.md](evaluating-skills.md).

```yaml
fixture: flawed-app            # a playground fixture (playground/setup.ts)
prompt: >                      # what a user would naturally ask
  Run a detection sweep on this project. Write the report to REPORT.md.
preconditions:                 # must hold, but prove nothing about the skill
  - file_exists: "REPORT.md"   # the prompt named it, so any agent produces it
gates:                         # what actually distinguishes the skill - on the TREE
  - repo_clean: { except: "REPORT.md" }
  - grep_min: { pattern: "console\\.log", in: "REPORT.md", count: "1" }
trajectory:                    # optional - what the agent DID, graded post-pass
  # from-skill(tooling): Run scripts/sweep.ts over the project
  - tool_used: { name: "sweep.ts", min: "1" }
  # from-skill(restraint): never commit what the sweep finds
  - tool_absent: { name: "git commit" }
judge:                         # optional, for what stays subjective
  criteria:
    - "Findings are grouped by cause, not occurrence"          # dimension: outcome
    - { dimension: trap, text: "Does not call a TODO a finding" }
  threshold: pass_all
```

`gates` are graded inside the container on the repository; `trajectory` and
`judge` are graded afterwards from `agent/trajectory.json`, which is written
only once the agent phase ends. That split is why `transcript_contains` and
`transcript_absent` are dead as gates and why the same questions belong in
`trajectory` instead. A trajectory check names an **action** - a command, a
path - never a word the agent might say, and cites the skill line it comes from
with its dimension. Full vocabulary and the rules:
[evaluating-skills.md](evaluating-skills.md#3-what-gets-graded-and-when).

A check belongs in `gates` only if an agent could plausibly fail it while still
doing what the prompt literally asked; otherwise it is a **precondition**, and
`npm run eval:lint` fails the manifest that keeps it as a gate. Where a leak is
irreducible - a rename cannot be requested without naming the new prop -
annotate the single gate below the comment:

```yaml
gates:
  # leak-ok: a rename cannot be asked for without naming the new prop
  - grep_count: { pattern: "variant=", in: "src/", count: "3" }
```

`file_matching` keys on a path pattern rather than one exact name, for an exit
condition that demands a KIND of file: "a blocking guardrail" is a git hook or a
CI job, and the agent picks where it lives.

Five more rules, each learned from a real run that failed for the wrong reason:

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
- **Tag each criterion with the dimension it grades** - `outcome`, `tooling`, `sequence`, `trap`, `restraint`. A bare string means `outcome`, which is what every criterion meant before the dimension existed, so nothing breaks; but an untagged `trap` criterion is filed as an outcome and the report cannot say where the skill helped. Do not tag `tooling` on a criterion a `tool_used` check already covers: that counts one fact twice.
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
npm run verify        # typecheck + lint + structure, trigger routing, versioning, behavioral tests
npm run test:mutation # every declared mutation must turn its tests red
npm run eval:dry      # every eval.yaml parses and names an existing fixture
npm run eval:lint     # no gate is satisfiable by copying its own prompt
```

All of them run in CI (`eval:lint` inside `npm test`). The harness fails (exit 1) on any drift from the
contract. What each gate covers - and what it structurally cannot see - is in
[developing.md](developing.md#what-each-gate-actually-protects).

## After adding / modifying

1. Bump `version` + `last-reviewed`, add a line to `skills/<name>/CHANGELOG.md` (the
   section itself is mandatory: `tools/skills.ts validate` requires it).
2. Add the skill to the `CATALOG` in [`src/catalog.ts`](../src/catalog.ts) with
   the signal that should propose it. `tests/installer.test.ts` fails on an
   artifact that exists on disk but no command can install.
3. Add the skill to [`docs/catalog.md`](catalog.md), the per-skill table (the
   README carries only the grouped counts). Nothing gates that table, so it is
   the line most likely to go stale.
4. The commands above, green.

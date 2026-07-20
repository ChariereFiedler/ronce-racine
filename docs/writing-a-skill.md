# Writing a canonical skill

## Admission criterion: is it truly generic?

Same criteria as for a rule ([writing-a-rule.md](writing-a-rule.md)). A skill belongs here **only** if it contains **no**:

- crate, package, module, directory, or script name of a specific project;
- imposed tracker (GitLab/Jira/GitHub hardcoded), project identifier format;
- stack imposed by a single project (Axum, Nuxt, Supabase RLS…).

If the workflow is useful but coupled, **split it**: the generic *protocol* comes here, the *tooled how* (project scripts, golden dataset, CI gates) stays in a project skill `<repo>/.claude/skills/`. Each generic skill notes up front that the project variant takes precedence.

## Standard skill contract

Every skill follows the [`templates/SKILL.template.md`](../templates/SKILL.template.md) model.

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
- `version`: semver. Bump **patch** for a clarification, **minor** for an added section, **major** for a protocol change.
- `metadata.last-reviewed`: date of the last review; `category` from the closed list.

**Body - standard sections** (omit an irrelevant section, never fill it empty):

1. Title + principle · 2. Routing "When ME and not X" · 3. Context to gather · 4. Protocol · 5. Templates · 6. Pitfalls & rationalizations · 7. Exit condition · 8. Tooling · 9. Changelog.

## Applied best practices

- **Concise**: SKILL.md body < 500 lines. Beyond that → progressive disclosure: move heavy references (grids, APIs) into `reference/*.md` with a table of contents at the top.
- **Reference depth ≤ 1**: all links start from the SKILL.md, never from a nested reference.
- **Scripts over inline**: a deterministic detection command goes into `scripts/` ("Run `scripts/x.sh`") - more reliable, saves context.
- **Output templates** in `templates/`, pitfalls in an Excuse → Reality table, exit condition as a checklist.

## Validation

```bash
npm test            # skills.ts harness: frontmatter, version, sections, links, depth
```

The harness fails (exit 1) if a skill drifts from the contract. Wire it into CI (see [`templates/anti-drift.gitlab-ci.yml`](../templates/anti-drift.gitlab-ci.yml)).

## After adding / modifying

1. Bump `version` + `last-reviewed`, add a line to the `## Changelog`.
2. `npm test` green.
3. Update the skills table in the [README](../README.md).

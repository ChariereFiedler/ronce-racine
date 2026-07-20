# Agent guide — Ronce Racine

Doc aimed at an agent (LLM) that **works on** this repo or uses it to **equip another project**. For the conceptual detail, see `docs/architecture.md`.

## What this repo is

Canonical source of **generic Claude Code config** (project-agnostic), installable in any repository:
`rules/` (always-on, by `paths`) · `skills/` (on-demand workflows) · `hooks/` (settings.json scripts — granular, one hook per `.ts` file) · `agents/` (subagents) · `scripts/` (executable detections). CLI: `install.ts` is the single tool (all families; rules-only via `--rules-only`). `rules.ts` is deprecated (still works, prints a deprecation notice) in favor of `install.ts install <repo> --rules-only`.

## Non-negotiable rules

- **Genericity**: an artifact here contains **no** project coupling (crate/script/path name, imposed tracker, imposed stack). If useful but coupled → split: the generic principle here, the tooling in the project repo. A routing override "e.g. acme-app → `x`, it wins" is allowed.
- **Language**: English (code identifiers may remain as-is). Correct accents, "siliceum" always lowercase.
- **Commits**: `type(scope): description` format (`feat|fix|refactor|test|docs|chore`), 1st line ≤ 72 chars, **never** mention Claude/AI/LLM. **Ask for confirmation before any commit.**
- **Pre-commit validation**: `npm test` must be **green** (see Harness).

## Using this repo on another project

```bash
npx tsx install.ts plan    <repo>          # detects the stack, PROPOSES (read-only)
npx tsx install.ts install <repo> [--all]  # copies relevant rules/skills/hooks/agents + lockfile
npx tsx install.ts check   <repo> [--strict]  # drift vs canonical (soft, or blocking)
npx tsx install.ts detach  <repo> <kind:name> # excludes a customized artifact from control
```
Detail: `docs/adopting-a-repo.md`. The lockfile `<repo>/.claude/.ronce-racine.json` tracks what is managed + the source SHA.

## Adding / modifying a hook

Hooks live in `hooks/`: one `.ts` file per logical hook. Each file must carry in its header JSDoc:

```
 * @version X.Y.Z          (semver)
 * @last-reviewed YYYY-MM-DD
```

The `skills.ts hooks` harness checks these two fields on every `npm test`. Available wirings per hook:

| Hook | Event | Matcher |
|------|-----------|---------|
| `skill-reminder.ts` | `UserPromptSubmit` | none |
| `bash-npm-silent.ts` | `PreToolUse` | `Bash` |
| `truncate-output.ts` | `PreToolUse` | `Bash` |
| `session-writer.ts` | `Stop` | none |
| `session-inject.ts` | `SessionStart` | `compact` |
| `session-precompact.ts` | `PreCompact` | none |
| `worktree-env-setup.ts` | `SessionStart` | none |

The `install.ts` installer merges the hook wirings for the selected hooks into `<repo>/.claude/settings.json` (deep-merge by event + matcher, idempotent, writes a `settings.json.bak` backup, preserves unrelated settings).

## Modifying / adding a skill

1. Read `docs/writing-a-skill.md` (contract) + `templates/SKILL.template.md` (model).
2. The skill must be generic, follow the standard sections, and have a `name` + `description` frontmatter ("Use when …", third person, **describes WHEN not HOW**) + `version` (semver) + `metadata.last-reviewed` + `category`.
3. Body < 500 lines; beyond that → progressive disclosure (`reference/*.md`). Runnable detection → `scripts/*.ts` (never `.sh`). Output template → `templates/`.
4. Bump `version` + `last-reviewed`, add a line to the `## Changelog`.
5. `npm test` green, then update the table in `README.md`.

## Modifying / adding a rule

1. Read `docs/writing-a-rule.md` + `templates/rule.template.md`.
2. Frontmatter: `paths` (globs; omit = always-on) + `version` + `metadata.last-reviewed`. Body: imperative, short bullets, no magic numbers.
3. `npm test` green + `README.md` table.

## Harness (`npm test`)

Five axes, all must pass:
- `skills.ts validate` — frontmatter, version, sections, `reference/`/`scripts/`/`templates/` links, depth ≤ 1.
- `skills.ts triggers` — routing discriminability (each quoted trigger classifies its skill in the top-3).
- `skills.ts rules` — versioning of the rules.
- `skills.ts scripts` — existence and non-emptiness of each `.ts` in `scripts/`.
- `skills.ts hooks` — presence and validity of `@version` (semver) and `@last-reviewed` (ISO date) in each `hooks/*.ts`.

Useful commands: `npm run skills:list`, `npm run skills:triggers`, `npm run rules:validate`, `npm run typecheck`.

## Layout

```
rules/        skills/<name>/SKILL.md (+ reference/ scripts/ templates/)
hooks/        agents/         scripts/
rules.ts      install.ts      skills.ts        (all TypeScript, via tsx)
docs/         templates/      README.md  AGENTS.md
```

## Common pitfalls

- Do not summarize a skill's workflow in its `description` (the agent would follow the summary instead of the skill).
- In a SKILL.md, only reference **existing** `reference/`/`scripts/`/`templates/` files (the harness checks).
- No `.sh`: every script/hook is `.ts` run by `tsx`.
- Any discipline still coupled (RLS, compiled queries, conventions of a specific framework) stays **on the project side**, not here.

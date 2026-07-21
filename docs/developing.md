# Developing on Ronce Racine

How to work **on the toolkit itself**. To adopt it in a project instead, see
[adopting-a-repo.md](adopting-a-repo.md); for the distribution model, see
[architecture.md](architecture.md).

## Setup

```bash
git clone https://github.com/ChariereFiedler/ronce-racine.git
cd ronce-racine && npm ci
```

Node >= 18 and nothing else. The toolkit has **no runtime dependency**: the
three devDependencies are TypeScript, `tsx` and Node's type definitions.
Everything else is Node builtins, on purpose - a config toolkit that drags a
dependency tree into your repo would defeat its own point.

## Repository map

| Path | What it is |
|---|---|
| `install.ts` | the only user-facing CLI (`plan`/`install`/`check`/`detach`), and the `bin` target |
| `tools/` | internal harnesses, never distributed |
| `skills/` `rules/` `hooks/` `agents/` `scripts/` | the artifacts themselves, the actual product |
| `tests/` | behavioral tests by domain (installer, hooks, selector, fixtures, eval) |
| `playground/` | fixture generator: throwaway repos to run the installer and the evals against |
| `templates/` | what a CONSUMER copies into their repo (`.adopted.example`, anti-drift CI) |
| `docs/templates/` | what a CONTRIBUTOR copies to author an artifact |

The four harnesses under `tools/`:

- `skills.ts` - static contract: frontmatter, semver, sections, links, trigger routing
- `tests.ts` - discovers and runs every `*.test.ts`
- `mutations.ts` - breaks the code on purpose and requires the tests to notice
- `eval.ts` - plays a skill through a real agent and verdicts the result

## The four commands

```bash
npm test              # contract + behavioral tests
npm run typecheck
npm run test:mutation # every declared mutation must turn its tests red
npm run eval:dry      # every eval.yaml parses and names an existing fixture
```

All four run in CI, on Node 18 and 22. What each one actually protects:

- **`npm test`** proves the artifacts respect their contract and the tooling
  behaves. It does NOT prove a skill still works: prose is not lintable.
- **`npm run test:mutation`** protects the tests themselves. A test that stays
  green on deliberately broken code is worse than no test, because it grants
  confidence it has not earned.
- **`npm run eval:dry`** protects the eval manifests without spending a token.
- Real agent evals cost API tokens and are never in CI - see below.

## The playground

```bash
npx tsx playground/setup.ts                       # (re)create playground/fixtures/
npx tsx install.ts plan playground/fixtures/fullstack-ci
```

Nine throwaway git repos with distinct stacks. Five carry **planted defects and
an `EXPECTED.md` ground truth** (`flawed-app`, `buggy-app`, `shipped-feature`,
`design-system`, `audit-target`), so a detector that stops detecting gets
caught by a test rather than by a user. `playground/fixtures/` is gitignored
and rebuilt from scratch on every run.

## Running a real evaluation

```bash
npx tsx tools/eval.ts run --only detection-sweep   # one skill, real agent, real cost
npx tsx tools/eval.ts run                          # all 34, before a release
```

Needs the `claude` CLI on PATH (or `EVAL_CLAUDE_BIN`). Full guide:
[evaluating-skills.md](evaluating-skills.md).

## Adding an artifact

| Type | Guide | Also required |
|---|---|---|
| Rule | [writing-a-rule.md](writing-a-rule.md) | `docs/rules/<name>.md`, entry in the README table |
| Skill | [writing-a-skill.md](writing-a-skill.md) | `README.md` + `eval.yaml` in the skill folder |
| Hook | see below | `@version` and `@last-reviewed` in the file header |
| Agent | copy an existing `agents/*.md` | entry in the README table |
| Script | belongs to a skill (`skills/<name>/scripts/`) | a co-located `*.test.ts` and a mutation entry |

**Hooks** live in `hooks/`, one file per hook, TypeScript only (never `.sh`).
Each carries `@version` (semver) and `@last-reviewed` (ISO date) in its header
comment, validated by `tools/skills.ts hooks`. A hook must **fail open**: it
runs on every session of every repo that installed it, so any error has to end
in a silent `exit 0` rather than blocking the user. Hooks that touch the
filesystem or persist anything are documented in [`SECURITY.md`](../SECURITY.md).

## What travels and what does not

The installer copies artifacts into a target repo's `.claude/`. Two things
deliberately stay canonical and are excluded from both the copy and the drift
comparison: `*.test.ts` (test procedures) and `eval.yaml` (eval manifests).
They are how we verify the toolkit, not payload for its users. If you add a
third category of internal-only file, exclude it in `copyToken` **and** in
`compareToken` in `install.ts`, and cover it with a test.

## Conventions

Commits follow `type(scope): description`, first line <= 72 characters.
Everything user-facing is in English, US spelling. Non-obvious decisions get an
append-only entry in [decisions.md](decisions.md) at the moment they are made -
never edit an old entry, add one that supersedes it.

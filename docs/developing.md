# Developing on Ronce Racine

How to work **on the toolkit itself**. To adopt it in a project instead, see
[adopting-a-repo.md](adopting-a-repo.md); for the distribution model, see
[architecture.md](architecture.md).

## Setup

This clone is the **contributor** path, for working on the toolkit itself. It
is no longer the documented way to *adopt* Ronce Racine in a project - that
path is `npx ronce-racine`, see [adopting-a-repo.md](adopting-a-repo.md).

```bash
git clone https://github.com/ChariereFiedler/ronce-racine.git
cd ronce-racine && npm ci
```

Node >= 18 and nothing else. The toolkit has **no runtime dependency**: the
devDependencies are the toolchain only - TypeScript, `tsx`, Node's type
definitions, and the test/lint tooling (Vitest with its v8 coverage provider,
Stryker, Biome). Everything the shipped code executes is a Node builtin, on
purpose - a config toolkit that drags a dependency tree into your repo would
defeat its own point.

If you `npm link` this clone into a test repo, that repo's `ronce-racine`
resolves to your local build instead of the published package, so `check`
will report staleness against your (uncommitted, unpublished) local changes -
that is expected, not a bug. Run `npm unlink ronce-racine` in the test repo to
restore the published resolution.

## Repository map

| Path | What it is |
|---|---|
| `install.ts` | the only user-facing CLI (`plan`/`install`/`check`/`detach`/`uninstall`), and the `bin` target |
| `src/` | what the CLI is made of: `paths`, `lock`, `catalog`, `detect`, `settings`, `selector` |
| `tools/` | internal harnesses, never distributed |
| `skills/` `rules/` `hooks/` `agents/` `scripts/` | the artifacts themselves, the actual product |
| `tests/` | behavioral tests by domain (installer, hooks, selector, build, fixtures, eval, routing, properties) |
| `playground/` | fixture generator: throwaway repos to run the installer and the evals against |
| `templates/` | what a CONSUMER copies into their repo (the anti-drift CI job) |
| `docs/templates/` | what a CONTRIBUTOR copies to author an artifact |

One build step, run automatically by `npm install` (`prepare`):
`tools/build.ts` compiles `hooks/*.ts` into `dist/hooks/*.mjs` (`.mjs` so a
target repo without `"type": "module"` in its `package.json` doesn't get a
Node `MODULE_TYPELESS_PACKAGE_JSON` warning on every hook fire), and the CLI
into `dist/install.js` + `dist/src/*.js` (the entrypoint imports its modules as
`./src/<name>.js`, so the built copies must sit under `dist/src`).
Hooks must never be compiled at run time: measured on
a hook that fires on every prompt, `npx tsx` costs 527 ms, node's own type
stripping 99 ms, and built JS 38 ms. Building once also means an adopting
repo needs Node and nothing else.

The three harnesses under `tools/`:

- `skills.ts` - static contract: frontmatter, semver, sections, links, trigger routing,
  disambiguation between neighbouring skills (`routing`, cases in `routing-cases.ts`),
  agent contract (`agents`), documented claims against the installer (`docs`)
- `mutations.ts` - breaks the code on purpose and requires the tests to notice
- `eval.ts` - plays a skill through a real agent and verdicts the result

The behavioral tests themselves run on **Vitest** (`tests/*.test.ts` plus the
per-skill detection scripts), serially: they spawn the real CLI and the real
hooks against shared state, so a parallel run makes them race.

## The commands

```bash
npm run verify        # typecheck + lint + test, the one to run before a PR
npm test              # contract harness + behavioral tests (Vitest)
npm run typecheck     # tsc --noEmit
npm run lint          # biome check . (--write to fix)
npm run coverage      # v8 coverage of the modules the tests IMPORT
npm run test:mutation # every declared mutation must turn its tests red
npm run test:mutation:inprocess   # Stryker, over the imported modules
npm run eval:dry      # every eval.yaml parses and names an existing fixture
```

## What each gate actually protects

The suite is deliberately layered, because no single one of these covers this
codebase - half of it only exists as a subprocess in someone else's repo.

| Gate | Protects | Blind to |
|---|---|---|
| `npm test` (contract) | frontmatter, semver, routing, doc claims | whether the prose skill still works - prose is not lintable |
| `npm test` (behavioral) | the installer, the hooks and the CLI as really executed | the artifacts' content |
| `npm run lint` | the band between "it typechecks" and "the tests pass" | anything the rule set does not encode |
| `npm run coverage` | the **imported** layer, gated on `tools/eval.ts` | everything spawned as a subprocess, i.e. most of it |
| `npm run test:mutation` | the tests themselves, on disk, subprocesses included | code no mutation entry names |
| `npm run test:mutation:inprocess` | the same, for imported modules Stryker can instrument | subprocess-tested files (they score 0% by construction) |
| `npm run eval:dry` | the eval manifests, without spending a token | whether a skill actually performs |
| a real eval run | whether a skill performs, judged by an agent | costs tokens, never in CI |

Two consequences worth internalizing:

- **The global coverage number is meaningless here** (~22% of statements) and
  is not gated; the only threshold in `vitest.config.ts` is on `tools/eval.ts`.
  The behavioral tests read the original file from disk through a subprocess,
  which in-process instrumentation cannot see. `npm run test:mutation` is what
  measures that code, and it must stay at 100% killed.
- **A test that stays green on deliberately broken code is worse than no
  test**, because it grants confidence it has not earned. That is the whole
  reason the mutation table exists; add an entry with every behavioral test.

CI runs these as parallel jobs (validate on Node 18 and 22, coverage, mutation,
plugin manifests, CodeQL, gitleaks), so a failure names itself instead of hiding
behind a four-minute serial run. The plugin job is the only one that leaves the
house: it runs `claude plugin validate --strict`, an external reader of the
frontmatter our own lenient parser accepts too easily.

## The playground

```bash
npx tsx playground/setup.ts                       # (re)create playground/fixtures/
npx tsx install.ts plan playground/fixtures/fullstack-ci
```

Ten throwaway git repos with distinct stacks. Six carry **planted defects and
an `EXPECTED.md` ground truth** (`flawed-app`, `buggy-app`, `shipped-feature`,
`design-system`, `audit-target`, `mixed-vocabulary`), so a detector that stops
detecting gets caught by a test rather than by a user. `playground/fixtures/` is gitignored
and rebuilt from scratch on every run.

## Running a real evaluation

```bash
npx tsx tools/eval.ts run --only detection-sweep   # one skill, real agent, real cost
npx tsx tools/eval.ts run                          # all 36, before a release
```

Needs the `claude` CLI on PATH (or `EVAL_CLAUDE_BIN`). Full guide:
[evaluating-skills.md](evaluating-skills.md).

## Adding an artifact

| Type | Guide | Also required |
|---|---|---|
| Rule | [writing-a-rule.md](writing-a-rule.md) | `docs/rules/<name>.md` (gated: same version, links its artifact), entry in the README table |
| Skill | [writing-a-skill.md](writing-a-skill.md) | `README.md` + `eval.yaml` in the skill folder (neither is distributed), an entry in `CATALOG` (`src/catalog.ts`, gated by `tests/installer.test.ts`) and in the README table |
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

The installer copies artifacts into a target repo's `.claude/`. A target repo
gets what its agent reads, and nothing that merely explains or verifies the
toolkit. Excluded from both the copy and the drift comparison in `install.ts`
(`copyToken` **and** `compareToken`):

- `*.test.ts` - test procedures
- `eval.yaml` - evaluation manifests
- `README.md` - the human page of a skill, which describes THIS repository

The one deliberate exception is `hooks/README.md`, copied on purpose: hooks
execute automatically on the target's machine, so documenting what runs there
is transparency rather than clutter. If you add another internal-only category,
exclude it in both places and cover it with a test.

Where human docs live follows the artifact's shape: next to it when the
artifact is a folder (`skills/<name>/README.md`), under `docs/` when it is a
single file (`docs/rules/<name>.md`, since a rule has no folder of its own).
Neither is ever distributed, and both are guarded against drifting from the
artifact they document.

## Conventions

Commits follow `type(scope): description`, first line <= 72 characters.
Everything user-facing is in English, US spelling. Non-obvious decisions get an
append-only entry in [decisions.md](decisions.md) at the moment they are made -
never edit an old entry, add one that supersedes it.

Running several agents or branches on this repository at once without letting
them share a working tree: [git-worktrees.md](git-worktrees.md).

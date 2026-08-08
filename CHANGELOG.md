# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and the project aims
to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Individual artifacts (rules, skills, hooks) also carry their own `version` in
their frontmatter; this file tracks the toolkit as a whole.

## [0.7.0] - 2026-08-08

### Added
- **`uninstall`**, the command that was missing. Driven by the lockfile, so it
  removes what it installed and nothing else: detached artifacts stay, a
  `*.pre-install.bak` is restored over the file the install overwrote, and only
  the hook commands it wired are dropped from `settings.json`. An artifact
  carrying local edits is kept as `*.pre-uninstall.bak` rather than dropped,
  a detached hook keeps its wiring, and the `.adopted` manifest is rewritten to
  the rules that survive. `--dry-run` lists the removal without performing it.
- **The lockfile is validated at the parsing boundary**, so every command
  refuses a malformed one instead of one command only. It is a committed file
  in the target repository, so `hook:../../../something` was a path traversal
  waiting for the first command that deletes on its strength, `check --strict`
  died in CI with a bare stack trace, and `install` copied a bad token forward
  into a fresh lockfile. An unreadable lockfile is also no longer reported as
  an absent one, which told users there was nothing to uninstall while their
  `.claude/` was full.

### Changed
- The CLI is split under `src/` (paths, lock, catalog, detect, settings,
  selector, uninstall); `install.ts` keeps the commands and the argument
  parsing, and re-exports what importers used to get from it.
- The README is organized around what each artifact is for rather than around
  the architecture, with the full skill catalog moved to
  [`docs/catalog.md`](docs/catalog.md) and the mechanics to
  [`docs/distribution-model.md`](docs/distribution-model.md) and
  [`docs/quality-bar.md`](docs/quality-bar.md).

### Fixed
- **The issue #1 regression guard had stopped guarding anything.** It asserted
  that `install.ts` contains no `cpSync`, which became vacuously true once
  `copyPath` moved to `src/lock.ts`. It now scans every installer source.
- **`docs/chardon/` shipped in the npm tarball.** The `files` entry `docs/`
  overrides `.gitignore`, so local workflow reports, absolute paths included,
  were published with the package.
- `tests/*.ts` are now typechecked (they were outside the `tsconfig.json`
  include), which surfaced three unsound casts.
- A batch of documentation claims that no longer matched the code, mostly in
  `docs/adopting-a-repo.md`, `docs/architecture.md` and `docs/developing.md`.

## [0.6.0] - 2026-08-08

Bringing the engineering floor up to the level of the monitoring plugin
sitting next to it - and then letting the new gates find what they found.

### Fixed
- **Install no longer half-completes on Windows** (#1). `fs.cpSync` onto an
  existing destination fails when the absolute path holds a non-ASCII
  character - the native override path calls unlink and reports `errno 0,
  syscall 'unlink'`. All four copy sites now go through `copyFileSync`, whose
  binding is unaffected. Thanks to @loicchossiere for a report that arrived
  with the root cause, a minimal repro and a table of what works.
- **A retried install no longer destroys the backup of your work.** Any run
  that did not reach the lockfile left the next one believing nothing was
  installed, so it backed up again - overwriting the backup holding the user's
  version with the canonical file, and producing a silently hybrid backup on a
  skill directory. A backup is now written only when none exists.
- **A dangling symlink in the target no longer aborts the install.** The copy
  followed links where `cpSync` recreated them; the backup walk crosses
  arbitrary user content, where one broken link threw ENOENT mid-install - and
  fed the defect above on the next run.
- **A crashed install no longer records itself as complete** (#1). The lockfile
  was written before the hooks were wired, so a failure during wiring left
  `check` reporting no drift while the requested hooks were absent - silently,
  for the life of the project. Wiring happens first now.
- **`agents/code-reviewer.md` loaded with no metadata at all.** An unquoted
  "Read-only: " made its frontmatter invalid YAML, which Claude Code does not
  fail loudly on: the read-only agent shipped without its tool restriction.
  Agents are now validated like every other artifact family.
- **Two artifacts were uninstallable**: `performance-profiling` and the
  `doc-code-parity` rule were present, documented and shipped in the package,
  yet in no catalog, so no command could install them. A test now requires the
  catalog and the disk to name the same set for every family - skills, rules,
  agents, scripts and hooks - in both directions. The skills-only version of
  that test is what let the second one through.
- **The sweep scripts built regexes from raw argv** - a component name holding a
  metacharacter changed what was matched, and a pathological one backtracked
  over every scanned line (CodeQL `js/regex-injection`, 4 sites).
- **A quoted eval criterion was unescaped twice**, so the criterion sent to the
  judge was not the one written (CodeQL `js/double-escaping`).

### Added
- **Installable as a Claude Code plugin**: `/plugin marketplace add
  ChariereFiedler/ronce-racine`. The skills and the agents, subscribed rather
  than copied. Deliberately not the rules, the hooks or the drift control -
  always-on context and code that runs on your machine belong in a reviewed
  diff.
- **`domain-glossary` skill** (36 skills now): fixes the vocabulary of a
  codebase in a `GLOSSARY.md`, resolving synonyms to one name and recording the
  rejected ones, so a search for the wrong word lands on the right entry.
  Ships with the `mixed-vocabulary` fixture that plants the defect.
- **Disambiguation lint** (`skills.ts routing`): ten realistic user sentences,
  each required to score strictly above the neighbours it is confusable with.
  **Five of the ten failed on the first run** - half the sampled skills did not
  distinguish themselves from their neighbours, which is the clearest argument
  yet that 36 skills is a surface to reduce rather than to grow.
- **The external plugin validator in CI** (`claude plugin validate --strict`),
  which reads the artifacts the way the runtime does. It found a defect a
  seven-check in-house harness had missed.
- **A rule against moving the target** in `docs/evaluating-skills.md`: every
  gate here scores something its author can edit, so a description changes only
  when the change is right independently of the test.
- **Agent contract validation** (`skills.ts agents`), the artifact family
  nothing checked until now.
- **`readme-freshness` hook** (opt-in): before a `git push` carrying structural
  changes, Claude re-reads README.md against the diff and reports the claims it
  contradicts - a wrong count, a renamed command, a mechanism that changed. An
  LLM rather than a grep, because that drift stays true-looking to any pattern
  you can write. Warns without blocking, fails open on every failure mode.
  Its first real catch was its own arrival: four stale claims in this README.

- **`performance-profiling` skill**: measure, then change,
  then measure again - noise floor before any timing claim, macro profile
  before micro work, off-CPU as well as on-CPU, and "inconclusive" as a
  first-class verdict. Per-ecosystem sheets for Go, Node/web, native and Tracy.
- **Biome** over the TypeScript, in CI. It caught an `Array.forEach` callback
  used as an expression, an implicitly-`any` `let`, and five assignments hidden
  inside `if` conditions. Formatting stays off: reformatting the tree would
  bury review in noise for no defect caught.
- **`npm run coverage`** (v8), with a threshold on the pure layer only. The
  global figure is deliberately not gated - most of this code runs as a
  subprocess and is invisible to in-process instrumentation.
- **`npm run verify`** = typecheck + lint + test, the single pre-PR command.
- **Property-based tests** (fast-check) over the eval manifest parser, the
  canonical hash and the selector's key handling, plus the mutation proving
  the selector property can fail.
- **A release workflow**: a `v*` tag runs the full gate set, checks that the
  tag and `package.json` agree, and opens the GitHub Release from the matching
  CHANGELOG section. npm publish stays manual.

### Changed
- **The README leads with the problem, not the architecture.** A visitor used to
  reach what the thing does on line 100 and the install command on line 190;
  both are now above the fold, the reference material follows, and the console
  capture is regenerated from a real run rather than edited in place.
- **Lint covers the scripts shipped to users**, not just the repo's own tooling:
  the four scripts skills install into other people's repositories were the
  only executable code nobody linted.
- **Example projects removed from 22 SKILL.md files.** `acme-app` / `beta-app`
  were private projects of mine, renamed for the release and meaningless to
  every reader since - carried in text a model reads on every invocation. The
  precedence note they sat in stays: each one names what the project skill
  knows that the generic one cannot.
- **CI split into parallel jobs** (validate on Node 18 and 22, coverage,
  mutation, CodeQL, gitleaks) with every action pinned to a SHA instead of a
  mutable tag, and `npm audit --omit=dev` on the runtime supply chain.
- Contributor docs now describe the suite that actually runs, with a table of
  what each gate protects and what it structurally cannot see.
- The workflow reports the monitoring plugin writes under `docs/chardon/` are
  ignored: they are observations of one machine, not documentation.

## [0.5.3] - 2026-07-21

A hook is never alone on its event.

### Changed
- **`truncate-output` keeps the rewritten command readable.** It replaced the
  command with an opaque base64 blob, which broke every downstream consumer:
  other plugins observing the same `PreToolUse` event, the transcript, the
  logs. The original now travels as a trailing shell comment, which runs to end
  of line and swallows quotes and apostrophes without interpreting them (a
  leading `: 'cmd';` prefix does not: it breaks on `echo it's fine`).
- **Bounded `git log` / `git diff` are no longer wrapped.** With `--oneline`,
  `--stat`, `--name-only` or a count, their output never reaches the truncation
  threshold, so rewriting them cost readability and broke composition for
  nothing.

### Added
- A composition rule in `hooks/README.md` and `AGENTS.md`: a hook that rewrites
  a command must preserve the original in readable form, must not rewrite when
  the rewrite buys nothing, and must never mask an exit code through a pipe.
- Regression tests asserting that a wrapped command keeps its original readable
  AND yields the same exit code as the bare one, so readability cannot be
  bought at the cost of correctness.

## [0.5.2] - 2026-07-21

### Fixed
- The published README still carried "The package is not on npm yet", so the
  npm page told visitors the package they were looking at did not exist. It
  now links the registry page and carries a version badge.
- `package.json` gained `homepage` and `bugs`, so the npm page links back to
  the project and its issue tracker.

### Added
- `tools/skills.ts docs` now also fails when a publishable package is
  documented as unpublished, or when the README does not link its registry
  page. Both were real defects that survived the first version of this check,
  which had been built around the two failures known at the time.

## [0.5.1] - 2026-07-21

### Fixed
- **Two shipped hooks were silently dead.** `truncate-output` and
  `truncate-bash-output` guarded their entry point on a `.ts` extension the
  built `.mjs` no longer has, so `main()` never ran: the hook exited 0
  producing nothing, and nothing signalled the failure. The truncate wrapper
  also pointed at a `.ts` helper the package does not ship.
- `hooks/README.md`, which ships into every adopting repo, still described the
  pre-0.5.0 wiring: it claimed the target needed `tsx` and showed
  `npx tsx .../hook.ts` in every example, while the installer now writes
  `node .../hook.mjs`.
- The Requirements section overstated "Node only": hooks do run on plain Node,
  but the optional detection scripts still ship as TypeScript and need `tsx`.

### Added
- `tools/skills.ts docs`, wired into `npm test`: compares the documentation
  against what the installer actually generates, so a doc describing a past
  behavior fails the build instead of reaching users.
- The `doc-code-parity` rule, and `builtHook()` in the test harness: assertions
  about shipped behavior now run the built artifact, not the source. The
  mutation harness rebuilds when it mutates a build input, so a stale build can
  no longer disguise a real defect as a false positive.

## [0.5.0] - 2026-07-21

Adoption stops requiring a clone.

### Changed
- **Adoption no longer needs a clone**: `npx ronce-racine install .`. The
  lockfile records the package version and a content hash instead of a git
  SHA, so `check` detects a canonical source that changed under the same
  version number. Lockfiles written by the clone-era installer keep working.
- The anti-drift CI template drops the pinned clone for a single
  `npx ronce-racine@<version> check . --strict`.

## [0.4.0] - 2026-07-21

### Changed
- **A target repo no longer receives the toolkit's own documentation.** Skill
  `README.md` pages describe THIS repository, so shipping them put roughly
  1300 lines of irrelevant prose into every adopting repo's `.claude/`. They
  now stay canonical, alongside `*.test.ts` and `eval.yaml`. The one deliberate
  exception is `hooks/README.md`: hooks execute on the target's machine, so
  documenting what runs there is transparency rather than clutter.

### Added
- Drift guards for the human documentation layer, which nothing watched before:
  every rule must have a `docs/rules/` page whose stated version matches the
  rule and which links the canonical artifact, and every skill must have a
  `README.md` that links its `SKILL.md`. Orphan pages documenting a deleted
  artifact now fail the build.

## [0.3.0] - 2026-07-21

### Added
- `docs/developing.md`: working on the toolkit itself - repo map, what each
  harness actually protects, the playground, and how to add every artifact
  type (hooks and agents had no guide at all).
- A header illustration on the README.

### Changed
- The internal harnesses (`skills.ts`, `tests.ts`, `mutations.ts`, `eval.ts`)
  moved to `tools/`. `install.ts`, the only user-facing entry point, stays at
  the repo root.
- `templates/` split by audience: it now holds only what a CONSUMER copies
  into their repo, while the artifact skeletons a CONTRIBUTOR starts from
  moved to `docs/templates/`.
- `docs/writing-a-skill.md` rewritten against the current contract. It
  described the pre-0.2.0 world, so a contributor following it produced a
  skill that CI rejects: no mention of the required `eval.yaml`, the per-skill
  `README.md`, the bilingual quoted triggers, or the test procedure that any
  script must ship.
- `bug-triage-structured` 1.1.0 and `adversarial-feature-challenge` 1.1.0:
  two protocol steps that evaluation runs showed agents skipping (the
  recurrence check, the persona switch) are now mechanical - a command to run
  and a count to state, rather than an instruction to remember.

### Fixed
- `templates/SKILL.template.md` was still entirely in French and carried a
  frontmatter GitHub could not parse (an unquoted colon), so the repository
  home rendered a YAML error banner. Both are now guarded by
  `tools/skills.ts templates`, wired into `npm test`.
- Evaluation manifests no longer punish an agent for obeying its own skill:
  build output and dependency lock files are pruned from the snapshot, and
  `repo_clean`'s `except` accepts a `name-*` prefix glob for skills whose
  deliverables cannot be named upfront (one ticket per finding).
- The `writing-robust-tests` fixture can actually run a test suite offline
  (`node --test`, nothing to install), so the "see it red, then green"
  discipline the skill demands is demonstrable rather than impossible.

### Removed
- `rules.ts`, deprecated since 0.1.x and superseded by
  `install.ts install <repo> --rules-only`.

## [0.2.0] - 2026-07-20

The toolkit can now test itself, at every level: its code, its detection
scripts, and the behavior its prose skills are supposed to produce. Plus the
post-release audit fixes from a full-repo sweep.

### Added
- **Skill evaluation harness** (`eval.ts`): plays a skill through headless
  `claude -p` inside a throwaway fixture, then verdicts it with mechanical
  gates derived from the skill's own exit conditions, plus an adjunct LLM
  judge for what stays subjective (a judge verdict without a verbatim
  quote as evidence is downgraded to a failure). Verdicts: PASS, FAIL(gate),
  JUDGE-FAIL(criterion), ERROR(infra, never a regression).
- **An `eval.yaml` manifest for every skill** (34/34), co-located with the
  skill. Closed gate vocabulary: `file_exists`, `file_absent`, `grep_zero`,
  `grep_count`, `repo_clean`, `transcript_contains`, `transcript_absent`,
  `exit_ok`. Manifests stay canonical and are never distributed to targets.
- `npm run eval:dry` validates every manifest with no agent call, no network
  and no auth - wired into CI. Real runs (`eval.ts run [--only <skill>]`) are
  on demand and before a release, never per push.
- **Mutation harness** (`npm run test:mutation`): 14 declared mutations must
  each turn their covering tests red; a surviving mutation fails CI.
- `install.ts --pick <token...>` installs exactly the named artifacts.
- Playground fixtures with planted defects and an `EXPECTED.md` ground truth:
  `flawed-app`, `buggy-app`, `shipped-feature`, `design-system`,
  `audit-target`.
- CI matrix on Node 18 (the documented minimum) and 22.
- `docs/evaluating-skills.md`.

### Changed
- Test harness split by domain (`tests/`) plus one co-located test procedure
  per executable skill script (`skills/<skill>/scripts/*.test.ts`); 80 tests.
  `*.test.ts` files are never distributed to target repos.
- `bin` now points at `install.ts`. Anyone who linked the package got the
  deprecated `rules.ts` CLI before this release.
- The interactive selector's keyboard logic is a pure, unit-tested reducer;
  the TTY shell only does I/O.
- Em dashes replaced with plain punctuation across the toolkit.

### Fixed
- CI now triggers on `main`, the public default branch. It previously only
  listened to `master` and therefore never ran on the public repository.
- Installer: pre-existing artifacts are backed up to `*.pre-install.bak` on
  first install instead of being silently overwritten (data loss); a
  `settings.json` whose `hooks` section has an unexpected shape no longer
  crashes mid-install; a truncated scan is announced instead of silently
  missing deep signals.
- Audit suite: every domain scores with the flat mean defined in
  `scoring-model.md` (dead weight formulas removed); orchestrator
  contradictions resolved; `performance-frontend` restored in `$ARGUMENTS`.
- `worktree-env-setup` hook: broken `.env` symlinks are repaired.
- `subscription-leak-scan.ts` and `templates/.adopted.example` translated to
  English; docs no longer recommend the deprecated `rules.ts sync`;
  `package.json` description translated and `engines` declared.

## [0.1.0] - 2026-07-20

First public release (pre-1.0: the API and artifact set may still change).

### Added
- MIT `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`.
- GitHub Actions CI running `typecheck` + the validation harness.
- A human documentation layer: a `README.md` per skill and a `docs/rules/<name>.md` per rule.
- Bilingual (English + French) invocation triggers on every skill.
- Deterministic behavioral tests (`tests.ts`) exercising the installer (plan/install/check/detach, drift, detached preservation, settings.json merge, `--rules-only`) and the hooks - wired into `npm test`.
- `install.ts --rules-only` (rules-only distribution under the unified lockfile drift).
- The installer now **auto-merges hook wirings into `.claude/settings.json`** (deep-merge by event/matcher, idempotent, `settings.json.bak` backup, preserves unrelated settings) instead of printing a snippet to hand-merge.

### Deprecated
- `rules.ts` (`sync`/`check`) - superseded by `install.ts --rules-only`; still works, prints a notice, to be removed later.

### Changed
- Public rebrand to **Ronce Racine**; the whole public repo is now English-facing (US spelling).
- Example project names in routing hints are fictional (`acme-app`, `beta-app`).
- Trimmed duplication in the per-skill READMEs (SKILL.md stays the source of truth for the steps).

### Fixed
- Installer no longer overwrites `detach`-ed (customized) artifacts on re-install; `check` no longer crashes when a canonical file was removed upstream.
- `session-inject` now uses the correct `SessionStart` output schema (nested `additionalContext`); `session-precompact` persists the memo instead of an ineffective `systemMessage`.
- `bash-npm-silent` preserves the real exit code (no output pipe) and only touches a bare `npm install`/`ci`; `truncate-output` runs via `npx tsx` (any Node) and no longer conflicts with it.
- Anti-drift CI template pins the canonical clone to the lockfile SHA, avoiding false-positive drift.
- Broken README cross-links, false changelog clauses, and untranslated leftovers.

### Removed
- Internal design/spec documents that were specific to other projects.

_Baseline (pre-OSS, 2026-06-19): 34 skills, 12 rules, 8 hooks, 2 agents and the `install.ts` CLI, validated by the `npm test` harness._

# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and the project aims
to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Individual artifacts (rules, skills, hooks) also carry their own `version` in
their frontmatter; this file tracks the toolkit as a whole.

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

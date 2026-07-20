# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and the project aims
to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Individual artifacts (rules, skills, hooks) also carry their own `version` in
their frontmatter; this file tracks the toolkit as a whole.

## [0.1.0] — unreleased

First public release (pre-1.0: the API and artifact set may still change).

### Added
- MIT `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`.
- GitHub Actions CI running `typecheck` + the validation harness.
- A human documentation layer: a `README.md` per skill and a `docs/rules/<name>.md` per rule.
- Bilingual (English + French) invocation triggers on every skill.
- Deterministic behavioral tests (`tests.ts`) exercising the installer (plan/install/check/detach, drift, detached preservation, settings.json merge, `--rules-only`) and the hooks — wired into `npm test`.
- `install.ts --rules-only` (rules-only distribution under the unified lockfile drift).
- The installer now **auto-merges hook wirings into `.claude/settings.json`** (deep-merge by event/matcher, idempotent, `settings.json.bak` backup, preserves unrelated settings) instead of printing a snippet to hand-merge.

### Deprecated
- `rules.ts` (`sync`/`check`) — superseded by `install.ts --rules-only`; still works, prints a notice, to be removed later.

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

# Decision log - Ronce Racine

Non-obvious decisions of the project. Never modify an entry: add one that supersedes it. Entries are in chronological order, oldest first, so a new one is appended at the end.

## 2026-06-25 - Repo name: "Ronce Racine"

**Context**: the repo (canonical source of the generic Claude config) needs a name in the same evocative vein as the rest of the ecosystem, replacing the working name `claude-rules`.

**Options**: explored several registers (garden/plant, forge/workshop, runic). Convergence on the **root** theme (the buried source from which everything else grows), then adjective+noun short-lists. Final proposal chosen, coming from the user.

**Decision**: **Ronce Racine** (slug `ronce-racine`).
Rationale: memorable alliteration; the meaning fits the repo - a bramble (*ronce*) roots (*racine*) and spreads everywhere, unkillable, like a layer of always-on disciplines distributed into every project, with a thorny side that says "discipline". A two-nouns-joined form, both words singular.

**Consequences**: the **actual rename** (local folder, git remote, occurrences of `claude-rules` in README/AGENTS/docs/`package.json`) is a separate operation. The internal name `claude-rules` stays valid until the rename is done.

**Status**: Accepted (name locked) · rename to implement.


## 2026-07-10 - Product decisions from the outside-in review

**Context**: two adversarial "external adopter" review passes surfaced product/adoption objections beyond the bugs (which were fixed and covered by `tests.ts`). These four shape how the repo presents and behaves; decided with the owner.

**Decisions**:
1. **Audit suite stays in this repo** but the README leads with the ~10 daily-driver skills and relegates the 9-skill industrialization-audit suite to an "advanced / opt-in" section. Rationale: splitting into a second repo/plugin is a large chore; de-emphasizing is cheap and fixes the blurred "discipline vs audit product" identity. Reassess a split if the audit suite grows its own release cadence.
2. **One CLI**: fold rules-only distribution into `install.ts --rules-only`; `rules.ts` becomes a deprecated shim (kept working, prints a notice) then removed later. Rationale: two CLIs + two drift mechanisms + two lockfiles for rules is the #1 day-one confusion. Single lockfile-based drift for everything.
3. **The installer auto-merges hook wirings into `.claude/settings.json`** (deep-merge by event+matcher, idempotent, writes a `.bak` backup and prints the diff) instead of only printing a snippet for the user to hand-merge. Rationale: the manual `settings.json` surgery was the highest-friction, highest-blast-radius step (clobbers an existing `hooks` block on a naive paste).
4. **README leads with the "why"**: the differentiator is *one canonical source installed into many repos with drift control*, which copy-paste and native plugins do not provide. Also document the Node ≥ 18 requirement in the target repo (hooks run via `npx tsx`) and keep the audit scoring table in a single shared `reference/` file (was duplicated across audit-report / audit-industrialisation).

**Consequences**: changes to `install.ts` (`--rules-only`, settings.json merge) are covered by new deterministic tests in `tests.ts`. `rules.ts` deprecated. Docs (README, adopting-a-repo, architecture, AGENTS) updated to the single-CLI story.

**Status**: Accepted · implementation in progress.


## 2026-07-10 - OSS strategy: the whole repo, public GitHub, MIT

**Context**: the repo (canonical source of generic Claude Code config) has always been designed to be project-agnostic - genericity is a hard admission criterion. The question "do we make it public OSS, and in what form?" had never been settled or recorded. Today it is framed to unblock preparation (license, hosting, cleanup).

**Options**: *Scope* - the whole repo vs. just `rules/`+`skills/` vs. a curated subset. *Hosting* - public GitHub vs. public GitLab vs. staying private. *License* - MIT vs. Apache-2.0.

**Decision**:
- **Scope**: **the whole repo** (rules + skills + hooks + agents + scripts + installer) becomes the OSS product.
- **Hosting**: **public GitHub** (better visibility for the Claude Code / plugins / skills ecosystem). The prior private repository stays or becomes a mirror/private source depending on infra needs.
- **License**: **MIT** (permissive, de facto standard, maximum adoption).

**Consequences** - blockers to lift before public release:
1. Add an MIT `LICENSE` file.
2. **Replace the private project names** embedded in the `skills/*/SKILL.md` routing examples and `templates/` with fictional example names (`acme-app`, `beta-app`).
3. Reframe the README (from an internal-projects framing) into a public positioning.
4. Couple it to the **Ronce Racine** rename (see the 2026-06-25 decision): name the GitHub repo `ronce-racine` at public creation rather than migrating afterward.
5. Add CONTRIBUTING / CODE_OF_CONDUCT / public CI (finishing touches).
6. Translate the whole public repo to English and add a per-artifact documentation layer; make every skill invocable in both English and French.
To reassess if: the genericity scope changes, or an infra constraint requires keeping the primary source elsewhere.

**Status**: Accepted (strategy locked) · preparation in progress.


## 2026-07-20 - Rename completed; public release via an orphan branch

**Context**: supersedes the "rename to implement" status of the 2026-06-25 entry. The rename to **Ronce Racine** is done everywhere (README, AGENTS, docs, `package.json`, lockfile name `.ronce-racine.json`); `claude-rules` only survives in historical entries of this file. Separately, the first public release had to decide what git history to publish: 46 of the 62 work commits contained private project names (the cleanup had only covered the working tree).

**Decision**: publish on GitHub (`ChariereFiedler/ronce-racine`, branch `main`, tag `v0.1.0`) from an **orphan branch** carrying a single initial commit of the clean tree. The full work history stays on the private GitLab remote.

**Consequences**: any future publication must regenerate the orphan branch from the private work branch - never push the work history to the public remote. The public repo's history starts at v0.1.0 by design.

**Status**: Done.


## 2026-07-21 - Public releases are linear, not orphan-per-release

**Context**: the 2026-07-20 entry established publishing from an orphan branch to keep the private work history out of the public repository. Applying that literally to the second release would have meant a second unrelated-history orphan, forcing a force-push over the published v0.1.0 and breaking every existing clone.

**Decision**: keep ONE public history. Each release is a single commit whose TREE is the work branch's tree and whose PARENT is the previous public commit, built with `git commit-tree $(git rev-parse <work-branch>^{tree}) -p github/main`. The private history still never reaches the public remote, and the public repository grows a normal linear history (v0.1.0 -> v0.2.0 -> ...) that pulls cleanly.

**Consequences**: no force-push, existing clones pull normally, `git log` on the public repo reads as one commit per release. The squash is deliberate: public history granularity is the release, not the work commit.

**Status**: Done (v0.2.0 published this way).

## 2026-08-08 - The 2026-07-10 decisions have shipped

**Context**: the two 2026-07-10 entries still read "implementation in progress" and "preparation in progress", which is no longer what the tree says. Their entries stay untouched; this one records where they landed, so a reader stops treating them as open work.

**State at v0.6.0**, each point checkable in the tree:
- **One CLI**: `rules.ts` is gone; `install.ts` carries `--rules-only`, and drift for every family goes through the single lockfile `.claude/.ronce-racine.json`.
- **settings.json merge**: implemented in `src/settings.ts` (deep merge by event and matcher, idempotent, `.bak` backup), covered by `tests/installer.test.ts`.
- **Audit scoring in one place**: `skills/audit-report/reference/scoring-model.md`, referenced rather than restated by `audit-industrialisation`.
- **OSS blockers**: MIT `LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md` and public GitHub Actions CI are in place; the private project names are gone from the artifacts (`acme-app` / `beta-app` in the examples); the repository is English-only, with `tools/skills.ts templates` failing on French in a contributor template.

**Consequences**: the open items from those entries are the ones not listed here, chiefly the reassessment of whether the audit suite deserves its own release cadence.

**Status**: Done.

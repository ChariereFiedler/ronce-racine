# Decision log — Ronce Racine

Non-obvious decisions of the project. Never modify an entry: add one that supersedes it.

## 2026-07-10 — Product decisions from the outside-in review

**Context**: two adversarial "external adopter" review passes surfaced product/adoption objections beyond the bugs (which were fixed and covered by `tests.ts`). These four shape how the repo presents and behaves; decided with the owner.

**Decisions**:
1. **Audit suite stays in this repo** but the README leads with the ~10 daily-driver skills and relegates the 9-skill industrialization-audit suite to an "advanced / opt-in" section. Rationale: splitting into a second repo/plugin is a large chore; de-emphasizing is cheap and fixes the blurred "discipline vs audit product" identity. Reassess a split if the audit suite grows its own release cadence.
2. **One CLI**: fold rules-only distribution into `install.ts --rules-only`; `rules.ts` becomes a deprecated shim (kept working, prints a notice) then removed later. Rationale: two CLIs + two drift mechanisms + two lockfiles for rules is the #1 day-one confusion. Single lockfile-based drift for everything.
3. **The installer auto-merges hook wirings into `.claude/settings.json`** (deep-merge by event+matcher, idempotent, writes a `.bak` backup and prints the diff) instead of only printing a snippet for the user to hand-merge. Rationale: the manual `settings.json` surgery was the highest-friction, highest-blast-radius step (clobbers an existing `hooks` block on a naive paste).
4. **README leads with the "why"**: the differentiator is *one canonical source installed into many repos with drift control*, which copy-paste and native plugins do not provide. Also document the Node ≥ 18 requirement in the target repo (hooks run via `npx tsx`) and keep the audit scoring table in a single shared `reference/` file (was duplicated across audit-report / audit-industrialisation).

**Consequences**: changes to `install.ts` (`--rules-only`, settings.json merge) are covered by new deterministic tests in `tests.ts`. `rules.ts` deprecated. Docs (README, adopting-a-repo, architecture, AGENTS) updated to the single-CLI story.

**Status**: Accepted · implementation in progress.

## 2026-07-10 — OSS strategy: the whole repo, public GitHub, MIT

**Context**: the repo (canonical source of generic Claude Code config) has always been designed to be project-agnostic — genericity is a hard admission criterion. The question "do we make it public OSS, and in what form?" had never been settled or recorded. Today it is framed to unblock preparation (license, hosting, cleanup).

**Options**: *Scope* — the whole repo vs. just `rules/`+`skills/` vs. a curated subset. *Hosting* — public GitHub vs. public GitLab vs. staying private. *License* — MIT vs. Apache-2.0.

**Decision**:
- **Scope**: **the whole repo** (rules + skills + hooks + agents + scripts + installer) becomes the OSS product.
- **Hosting**: **public GitHub** (better visibility for the Claude Code / plugins / skills ecosystem). The prior private repository stays or becomes a mirror/private source depending on infra needs.
- **License**: **MIT** (permissive, de facto standard, maximum adoption).

**Consequences** — blockers to lift before public release:
1. Add an MIT `LICENSE` file.
2. **Replace the private project names** embedded in the `skills/*/SKILL.md` routing examples and `templates/` with fictional example names (`acme-app`, `beta-app`).
3. Reframe the README (from an internal-projects framing) into a public positioning.
4. Couple it to the **Ronce Racine** rename (see the 2026-06-25 decision): name the GitHub repo `ronce-racine` at public creation rather than migrating afterward.
5. Add CONTRIBUTING / CODE_OF_CONDUCT / public CI (finishing touches).
6. Translate the whole public repo to English and add a per-artifact documentation layer; make every skill invocable in both English and French.
To reassess if: the genericity scope changes, or an infra constraint requires keeping the primary source elsewhere.

**Status**: Accepted (strategy locked) · preparation in progress.

## 2026-06-25 — Repo name: "Ronce Racine"

**Context**: the repo (canonical source of the generic Claude config) needs a name in the same evocative vein as the rest of the ecosystem, replacing the working name `claude-rules`.

**Options**: explored several registers (garden/plant, forge/workshop, runic). Convergence on the **root** theme (the buried source from which everything else grows), then adjective+noun short-lists. Final proposal chosen, coming from the user.

**Decision**: **Ronce Racine** (slug `ronce-racine`).
Rationale: memorable alliteration; the meaning fits the repo — a bramble (*ronce*) roots (*racine*) and spreads everywhere, unkillable, like a layer of always-on disciplines distributed into every project, with a thorny side that says "discipline". A two-nouns-joined form, both words singular.

**Consequences**: the **actual rename** (local folder, git remote, occurrences of `claude-rules` in README/AGENTS/docs/`package.json`) is a separate operation. The internal name `claude-rules` stays valid until the rename is done.

**Status**: Accepted (name locked) · rename to implement.

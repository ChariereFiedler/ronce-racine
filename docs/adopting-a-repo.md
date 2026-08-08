# Adopting Ronce Racine in a repo

## Option A - Smart installer (recommended)

`ronce-racine` detects the project's stack (frontend/backend/tests/SQL/migrations/CI/infra/git) and proposes the relevant artifacts, with a reason for each.

```bash
# 1. Proposal (read-only) - nothing is written
npx ronce-racine plan .

# 2. Install: an interactive selector opens, pre-checked with the recommendations
npx ronce-racine install .
```

`install` is interactive when it runs on a TTY: the selector lists the recommended artifacts (pre-checked) plus the optional ones (unchecked), and you confirm or amend the selection. Three flags skip or widen that step:

| Flag | Effect |
|---|---|
| `--yes` (`-y`) | no prompt: installs the pre-checked set (also the behavior when stdin is not a TTY, e.g. in CI) |
| `--all` | pre-checks the optional artifacts too (audits, etc.), still through the selector unless combined with `--yes` |
| `--pick <token...>` | installs exactly these `kind:name` tokens (`skill:detection-sweep`, `rule:commits.md`) and nothing else |
| `--rules-only` | restricts the whole run to rules |

The installer copies into `.claude/`:
- `rules/shared/` + the generated `.adopted` manifest - drift is watchable via `ronce-racine check .`
- `skills/<name>/` (relevant skills), `scripts/`, `hooks/`, `agents/`

It merges the hook wirings into `.claude/settings.json` (deep-merges by event + matcher, idempotent, preserves unrelated settings, and backs an existing file up to `settings.json.bak` before rewriting it). A pre-existing artifact the installer has never managed is copied to `<file>.pre-install.bak` before being overwritten, so a hand-written skill or rule of yours is never lost silently. Check the diff (`git diff`, `git status`), then commit - `.claude/` travels via git → teammates + CI agents.

Update later: rerun `ronce-racine install .` (idempotent). For rules only, use `ronce-racine install . --rules-only` (same lockfile-based drift as everything else).

### Anti-drift (lockfile)

`ronce-racine` writes `.claude/.ronce-racine.json`: what is managed + the package version and a content hash at install time.

```bash
npx ronce-racine check .            # soft: warns (drift + staleness)
npx ronce-racine check . --strict   # exit 1 on drift (blocking gate)
```

- **Drift**: a managed artifact was modified locally → reported (`~file`, `-missing`, `+added`).
- **Assumed customization**: `ronce-racine detach . skill:detection-sweep` takes the item out of control (it becomes "yours"). The token is the one recorded in the lockfile, so rules carry their extension (`rule:commits.md`).
- **Backing out**: `ronce-racine uninstall .` removes what the lockfile records and unwires its own hooks, keeping detached items and restoring any `*.pre-install.bak`. Preview it with `--dry-run`. See [`distribution-model.md`](distribution-model.md#removing-an-installation).
- **Staleness**: the canonical version has moved on since install → "rerun install" warning.

CI gate: the [`templates/anti-drift.gitlab-ci.yml`](../templates/anti-drift.gitlab-ci.yml) snippet (soft via `allow_failure`, blocking by removing that line).

> The sections below describe the **rules-only approach** (rules and nothing else), still driven by `ronce-racine`.

## 1. Choose the adopted rules

Selection happens at install time, not in a hand-written file:

```bash
npx ronce-racine install . --rules-only              # selector, pre-checked with the detected stack
npx ronce-racine install . --rules-only --pick rule:minimal-code.md rule:commits.md
```

`.claude/rules/shared/.adopted` is **written by the installer** as a record of what it adopted; editing it changes nothing, and the next install rewrites it. What is actually managed lives in the lockfile.

Only adopt the rules for which you want the **generic canonical** version. A rule you want to **enrich locally** (e.g. `secure-logging` with the project's identifiers and lint): leave it out of the selection, and keep your version in `.claude/rules/shared/` or `rules/<project>/`. A rule the installer never wrote is never touched by `install` or `check`; one you customized after adopting it is what `detach` is for.

## 2. Commit

The adopted files land in `.claude/rules/shared/` and are tracked in the lockfile (same drift mechanism as everything else). Check the diff (`git diff`), then commit:

```bash
git add .claude/rules/shared .claude/.ronce-racine.json
git commit -m "chore(rules): adopt the generic canonical rules (ronce-racine)"
```

## 3. Anti-drift CI gate (recommended)

Add the job from [`templates/anti-drift.gitlab-ci.yml`](../templates/anti-drift.gitlab-ci.yml) to the repo's `.gitlab-ci.yml`. It fails if an adopted rule has diverged from the canonical version.

Prerequisite: the runner must be able to reach the npm registry (the job runs `npx ronce-racine@<version> check`). If you prefer no network dependency in CI, the committed files already freeze the content - the gate only adds drift **detection**.

## 4. Update later

When the canonical version evolves:

```bash
cd <repo>
npx ronce-racine install . --rules-only --yes
git add .claude/rules/shared .claude/.ronce-racine.json
git commit -m "chore(rules): resync canonical rules"
```

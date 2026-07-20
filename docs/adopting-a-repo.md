# Adopting Ronce Racine in a repo

## Option A - Smart installer (recommended)

`install.ts` detects the project's stack (frontend/backend/tests/SQL/migrations/CI/infra/git) and proposes the relevant artifacts, with a reason for each.

```bash
# 1. Proposal (read-only) - nothing is written
npx tsx /path/to/ronce-racine/install.ts plan .

# 2. Install the recommended ones (add --all to include optionals: audits, etc.)
npx tsx /path/to/ronce-racine/install.ts install . --all
```

The installer copies into `.claude/`:
- `rules/shared/` + the `.adopted` manifest (rules) - drift is watchable via `install.ts check .`
- `skills/<name>/` (relevant skills), `hooks/`, `agents/`

It merges the hook wirings into `.claude/settings.json` (writes a `settings.json.bak` backup, deep-merges by event + matcher, idempotent, preserves unrelated settings). Check the diff (`git diff`, `git status`), then commit - `.claude/` travels via git → teammates + CI agents.

Update later: rerun `install.ts install .` (idempotent). For rules only, use `install.ts install . --rules-only` (same lockfile-based drift as everything else).

### Anti-drift (lockfile)

`install.ts` writes `.claude/.ronce-racine.json`: what is managed + the canonical SHA at install time.

```bash
npx tsx /path/ronce-racine/install.ts check .            # soft: warns (drift + staleness)
npx tsx /path/ronce-racine/install.ts check . --strict   # exit 1 on drift (blocking gate)
```

- **Drift**: a managed artifact was modified locally → reported (`~file`, `-missing`, `+added`).
- **Assumed customization**: `install.ts detach . skill:detection-sweep` takes the item out of control (it becomes "yours").
- **Staleness**: the canonical version has moved on since install → "rerun install" warning.

CI gate: the [`templates/anti-drift.gitlab-ci.yml`](../templates/anti-drift.gitlab-ci.yml) snippet (soft via `allow_failure`, blocking by removing that line).

> The sections below describe the **rules-only approach** (rules and nothing else), still driven by `install.ts`.

## 1. Declare the adopted rules

Create `<repo>/.claude/rules/shared/.adopted` (template: [`templates/.adopted.example`](../templates/.adopted.example)):

```
# Generic rules managed by the Ronce Racine canonical source.
minimal-code.md
commits.md
test-discipline.md
```

Only list the rules for which you want the **generic canonical** version. A rule you want to **enrich locally** (e.g. `secure-logging` with the project's identifiers and lint): do not list it, and keep your version in `.claude/rules/shared/` or `rules/<project>/`.

## 2. Synchronize

```bash
npx tsx /path/to/ronce-racine/install.ts install . --rules-only
```

The adopted files are copied into `.claude/rules/shared/` and tracked in the lockfile (same drift mechanism as everything else). Check the diff (`git diff`), then commit:

```bash
git add .claude/rules/shared
git commit -m "chore(rules): adopt the generic canonical rules (ronce-racine)"
```

> Deprecated: `rules.ts sync .` still works but prints a deprecation notice - prefer `install.ts install . --rules-only`.

## 3. Anti-drift CI gate (recommended)

Add the job from [`templates/anti-drift.gitlab-ci.yml`](../templates/anti-drift.gitlab-ci.yml) to the repo's `.gitlab-ci.yml`. It fails if an adopted rule has diverged from the canonical version.

Prerequisite: the runner must be able to clone `ronce-racine` (the job clones it). If you prefer no network dependency in CI, the committed files already freeze the content - the gate only adds drift **detection**.

## 4. Update later

When the canonical version evolves:

```bash
cd <repo>
npx tsx /path/to/ronce-racine/install.ts install . --rules-only
git add .claude/rules/shared && git commit -m "chore(rules): resync canonical rules"
```

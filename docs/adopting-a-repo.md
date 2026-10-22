# Adopting Ronce Racine in a repo

## The installer

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

CI gate: `check --strict` is one command, so any runner can host it. On GitLab,
the [`templates/anti-drift.gitlab-ci.yml`](../templates/anti-drift.gitlab-ci.yml)
snippet is ready to paste (soft via `allow_failure`, blocking by removing that
line). On GitHub Actions, the same gate is one step:

```yaml
# .github/workflows/ronce-racine.yml
name: Config drift
on: [push, pull_request]
jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      # Pin the version the repo installed, so a new release is a decision
      # rather than a red pipeline. `check` without --strict only warns.
      - run: npx ronce-racine@<version> check . --strict
```

Prerequisite, on either forge: the runner must reach the npm registry. If you
prefer no network dependency in CI, the committed files already freeze the
content - the gate only adds drift **detection**.

## The rules-only path

`ronce-racine install . --rules-only` restricts the whole run to rules; add
`--pick rule:minimal-code.md rule:commits.md` to name them, or `--yes` to skip
the selector when resyncing later. Only adopt the rules for which you want the
**generic canonical** version: a rule you want to enrich locally, leave out of
the selection and keep in `.claude/rules/shared/` or `rules/<project>/`. A rule
the installer never wrote is never touched by `install` or `check`; one you
customized after adopting it is what `detach` is for.

`.claude/rules/shared/.adopted` is **written by the installer** as a record of
what it adopted; editing it changes nothing, and the next install rewrites it.
What is actually managed lives in the lockfile. Commit
`.claude/rules/shared` and `.claude/.ronce-racine.json` together.

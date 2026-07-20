# Rule — `pre-commit-secret-detection`

> No secret ever reaches a commit. Scan the staged diff every time; treat any pushed secret as compromised.

| | |
|---|---|
| **Type** | Rule (always-on) |
| **Scope (`paths`)** | always active |
| **Version** | 1.0.0 |
| **Artifact** | [`rules/pre-commit-secret-detection.md`](../../rules/pre-commit-secret-detection.md) |
| **Paired skill** | [`commit-readiness-review`](../../skills/commit-readiness-review/) |

## What it enforces

A hard gate: **no credential of any kind is ever committed** — API keys, tokens, passwords, private keys, connection strings. The rule is always active because a leak can happen in any file type, at any commit.

## Why it matters

A secret is not "removed" by a later commit. Once it exists in git history — and especially once it is pushed — it must be considered **compromised**: anyone with repo access (now or via a future clone/fork/backup) can recover it. That is why the response to a pushed secret is **rotation on the provider side + history purge**, never a plain `git revert` (which leaves the value in history).

The rule is layered so it fails safe:

- **Local, tool present** — `gitleaks protect --staged` blocks the commit before the secret lands.
- **Local, no tool** — a grep fallback on common patterns warns; it does not block, so it never wedges a commit, but it flags the obvious cases.
- **CI** — `gitleaks detect` over the full repo and history is the backstop that catches anything local checks missed. This CI must never be disabled.

## How to apply it

### Scanning

```bash
# Preferred: dedicated scanner on the staged diff
gitleaks protect --staged

# Fallback when gitleaks is unavailable
git diff --cached | grep -nE 'AKIA|BEGIN .* PRIVATE KEY|sk_live_|glpat-|ghp_|(password|secret|token)\s*[:=]'
```

### Handling a false positive

- **One-off**: add a `gitleaks:allow` comment on the offending line.
- **Systemic**: add an allowlist entry to `.gitleaks.toml` (by path or by value regex).
- **Never** silence a finding by disabling the scan.

### Handling a real secret

1. Do **not** commit. Move the value to an environment variable or a secret manager (in a gitignored file).
2. If already committed locally but **not pushed**: `git reset --soft HEAD~1`, then remove the value.
3. If already **pushed**: rotate the credential immediately on the provider side, then purge history with `git filter-repo`.

## Related

- [`commit-readiness-review`](../../skills/commit-readiness-review/) orchestrates this check as its secret-scan step before a commit.
- Companion rule: `secure-logging` (never log sensitive data).

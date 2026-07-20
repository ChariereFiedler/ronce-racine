---
version: 1.0.0
metadata:
  last-reviewed: 2026-06-19
---

# Secret detection before commit

- **No secret ever committed**: API key, token, password, private key, connection credential. A pushed secret is compromised → rotate + purge history, never a plain revert.
- **Scan the staged diff before every commit**: a dedicated tool when available (`gitleaks protect --staged`), otherwise a grep fallback on common patterns (`AKIA…`, `BEGIN … PRIVATE KEY`, `sk_live_`, `glpat-`, `ghp_`, `password|secret|token\s*[:=]`).
- **With no tool installed**: the hook warns without blocking; CI (`gitleaks detect`, full repo + history) is the safety net. Never disable the detection CI.
- **False positive**: one-off exception via a `gitleaks:allow` comment on the line; systemic exception via a `.gitleaks.toml` allowlist (paths or value regex), never by disabling the scan.
- **If a real secret is detected**: do not commit; move the value to an environment variable / secret manager (a gitignored file). Already committed locally, not pushed → `git reset --soft HEAD~1` then remove it. Already pushed → **immediate rotation** on the provider side + purge (`git filter-repo`).
- Paired with the `commit-readiness-review` skill (secret-scan step) that orchestrates the pre-commit check.

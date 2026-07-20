# Supply Chain Security section

Questions: ci-10 (Pipeline security / Supply Chain Security).

## Table of contents

- [ci-10 - Pipeline security (Supply Chain Security)](#ci-10--pipeline-security-supply-chain-security--should)

---

### ci-10 - Pipeline security (Supply Chain Security) - `should`

**Analyze:** Actions/plugins used in the pipeline, permissions, secrets management in CI, SLSA compliance

**Commands:**
- `grep -E "@v[0-9]|@latest|@main|@master" .github/workflows/*.yml 2>/dev/null` → actions pinned or not
- `grep -E "@[a-f0-9]{40}" .github/workflows/*.yml 2>/dev/null` → actions pinned by hash (good practice)
- `ls .github/dependabot.yml renovate.json .renovaterc 2>/dev/null` → dependency management
- `grep -E "permissions:|GITHUB_TOKEN" .github/workflows/*.yml 2>/dev/null` → minimal permissions
- `grep -ri "OIDC\|workload.identity\|assume.role" .github/workflows/*.yml .gitlab-ci.yml 2>/dev/null` → OIDC for cloud access
- `grep -rn "password\|token\|secret\|api.key" .gitlab-ci.yml .github/workflows/*.yml 2>/dev/null | grep -v '\${{' | grep -v '\$CI_' | head -5` → hardcoded secrets (anti-pattern)
- `grep -ri "slsa\|provenance\|hermetic\|reproducible" .gitlab-ci.yml .github/workflows/*.yml 2>/dev/null` → SLSA compliance
- `grep -ri "gitsign\|signed.commit\|gpg\|ssh.*sign" .github/workflows/*.yml .gitlab-ci.yml 2>/dev/null` → signed commits
- `grep -ri "scorecard\|openssf" .github/workflows/*.yml 2>/dev/null` → OpenSSF Scorecard

**Check:**
- Actions/plugins pinned by hash (not `@latest`)
- Secrets injected via vault/CI secrets (not hardcoded)
- Minimal permissions (GITHUB_TOKEN scoped)
- Deployment audit trail
- Dependabot/Renovate configured
- Signed commits required (GPG, SSH signing, Gitsign)
- SLSA provenance of artifacts
- Ephemeral runners (no persistence between builds)
- Strict branch protection

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No security measure on the pipeline. Shared runners without isolation. Secrets in cleartext in the CI variables. |
| 1 | Secrets in a dedicated manager (Vault, CI secrets). Dedicated runners. Dependency lockfiles present but not verified. |
| 2 | Secret scanning in CI (GitLeaks, TruffleHog). SAST integrated. Signed commits required. Dependency pinning with hash verification. Least privilege on the runners. |
| 3 | SLSA Level 2: artifact provenance generated. Ephemeral runners. Strict branch protection. DAST in staging. Full pipeline audit trail. OpenSSF Scorecard > 7. |
| 4 | SLSA Level 3+: hermetic and reproducible builds. Attestations verified at admission (Kyverno, OPA Gatekeeper). Supply chain policy enforcement. Signed commits + signed artifacts + signed SBOM. Zero detectable hardcoded secret. |

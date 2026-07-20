# Artifact Management section

Questions: ci-08 (Artifact management and registries).

## Table of contents

- [ci-08 - Artifact management and registries](#ci-08--artifact-management-and-registries--should)

---

### ci-08 - Artifact management and registries - `should`

**Analyze:** Docker registry, private npm registry, publish configs, signatures, SBOM

**Commands:**
- `grep -E "registry|artifact|publish|push|docker.*push" .gitlab-ci.yml .github/workflows/*.yml 2>/dev/null` → artifact publishing
- `git tag | head -5` → check tag-based versioning
- `grep -E "version|semver" package.json 2>/dev/null` → semantic versioning
- `grep -E "cosign\|sigstore\|sign\|sbom\|syft\|trivy" .gitlab-ci.yml .github/workflows/*.yml Dockerfile 2>/dev/null` → signing and scanning
- `grep -E "retention\|cleanup\|expire\|prune" .gitlab-ci.yml .github/workflows/*.yml 2>/dev/null` → retention policy
- `grep -E "slsa\|provenance\|attestation" .gitlab-ci.yml .github/workflows/*.yml 2>/dev/null` → SLSA provenance

**Check:**
- Centralized registry for artifacts (private preferably)
- Semantic versioning
- Immutable and signed artifacts (Cosign/Sigstore)
- SBOM generated automatically (Syft, Trivy)
- Retention policy (cleanup of old versions)
- Vulnerability scanning on images
- Provenance attestation (SLSA)

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No artifact registry. Images built locally. Artifacts stored ad-hoc. |
| 1 | Basic artifact registry (Docker Hub, npm registry). Tagging by latest or build number. No retention policy. |
| 2 | Private registry with semantic versioning. Retention policy. Image vulnerability scanning. Single artifact promoted between environments. |
| 3 | Signed artifacts (Cosign/Sigstore). SBOM generated automatically for each build. Continuous registry scanning. Admission policy (only signed images are deployed). |
| 4 | Provenance attestations (SLSA Level 3+). SBOM integrated into the CVE response process (< 4h reaction). VEX (Vulnerability Exploitability eXchange). Reproducible hermetic builds. |

# CI Pipeline section

Questions: ci-01 (CI pipeline architecture).

## Table of contents

- [ci-01 - CI pipeline architecture (build, lint, test, scan, artifacts)](#ci-01--ci-pipeline-architecture-build-lint-test-scan-artifacts--must)

---

### ci-01 - CI pipeline architecture (build, lint, test, scan, artifacts) - `must`

**Analyze:** `.github/workflows/*.yml`, `.gitlab-ci.yml`, `Jenkinsfile`, `bitbucket-pipelines.yml`, `.circleci/config.yml` files

**Commands:**
- `ls .github/workflows/*.yml .gitlab-ci.yml Jenkinsfile bitbucket-pipelines.yml .circleci/config.yml 2>/dev/null` → detect the CI system
- `grep -E "lint|test|sast|scan|build" .gitlab-ci.yml .github/workflows/*.yml 2>/dev/null` → identify the stages
- `grep -E "cache|artifacts|save_cache|restore_cache" .gitlab-ci.yml .github/workflows/*.yml 2>/dev/null` → check the caching
- `grep -E "matrix|strategy" .github/workflows/*.yml 2>/dev/null` → detect matrix builds
- `grep -E "parallel|needs:|dependencies:" .gitlab-ci.yml 2>/dev/null` → check parallelization

**Check:**
- Ordered stages (fail-fast): lint → build → unit tests → integration tests → SAST → artifact publish
- Parallelization of independent steps
- Dependency caching (node_modules, .m2, pip cache, Docker layers)
- Matrix builds (multi-OS, multi-version)
- Feedback time < 10 min (check durations if the logs are accessible)

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No CI pipeline. Manual builds on the developer machine. No standardization. |
| 1 | Basic CI pipeline: build + a few unit tests. Triggered manually or on the main branch only. |
| 2 | Structured CI pipeline on every PR: lint, build, unit tests, artifact publish. Dependency caching. Feedback in < 15 min. |
| 3 | Full multi-stage pipeline: lint, build, unit + integration tests, SAST, signed artifact generation. Parallelization. Matrix builds. Feedback in < 10 min. |
| 4 | Optimized pipeline with predictive test selection, distributed builds, feedback in < 5 min. Reusable Pipeline as Code (shared templates). Pipeline reliability metrics (flaky rate < 1%). |

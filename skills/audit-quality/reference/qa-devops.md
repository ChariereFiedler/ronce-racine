# Audit grid - QA & DevOps section

16 questions. Tests, CI/CD, code quality, dependency security, observability, code review, DORA metrics.

## Table of contents

- [QA-01 - Coverage measurement and tracking (unit + integration)](#qa-01--coverage-measurement-and-tracking-unit--integration--criticality-must)
- [QA-01a - Test strategy by criticality](#qa-01a--test-strategy-by-criticality--criticality-should)
- [QA-02 - Post-deployment smoke tests](#qa-02--post-deployment-smoke-tests--criticality-must)
- [QA-03 - Single artifact promotion](#qa-03--single-artifact-promotion--criticality-should)
- [QA-04 - CI/CD quality gates](#qa-04--cicd-quality-gates--criticality-must)
- [QA-05 - CI/CD feedback speed](#qa-05--cicd-feedback-speed--criticality-should)
- [QA-06 - Code quality & debt](#qa-06--code-quality--debt--criticality-should)
- [QA-07 - Dependency security (SCA)](#qa-07--dependency-security-sca--criticality-must)
- [QA-07a - Dependency update process](#qa-07a--dependency-update-process--criticality-should)
- [QA-08 - Incident reproducibility](#qa-08--incident-reproducibility--criticality-should)
- [QA-09 - Realistic test datasets](#qa-09--realistic-test-datasets--criticality-should)
- [QA-10 - Application profiling](#qa-10--application-profiling--criticality-could)
- [QA-11 - CI/CD security](#qa-11--cicd-security--criticality-must)
- [QA-12 - Product-oriented observability](#qa-12--product-oriented-observability--criticality-should)
- [QA-13 - Code review process](#qa-13--code-review-process--criticality-must)
- [QA-14 - DORA metrics](#qa-14--dora-metrics--criticality-should)

---

### QA-01 - Coverage measurement and tracking (unit + integration) - Criticality: **must**

**Analyze:** Coverage tools (Istanbul/nyc, JaCoCo, coverage.py, PCOV), coverage quality gates, mutation testing

**Check:**
- Line AND branch coverage measured
- Coverage reporting in CI (Codecov, Coveralls, SonarQube)
- Coverage thresholds defined (quality gate)
- Mutation testing as a complement (Stryker, PIT)
- Coverage on changed code (clean as you code)

**Commands:**
```bash
# Look for coverage configs
ls .nycrc* jest.config* vitest.config* phpunit.xml* 2>/dev/null
grep -ri "coverage" package.json composer.json 2>/dev/null
grep -ri "codecov\|coveralls\|sonar" .github/ .gitlab-ci.yml 2>/dev/null
# Look for mutation testing
grep -ri "stryker\|infection" package.json composer.json 2>/dev/null
```

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No coverage measurement. Tests optional. |
| 1 | Coverage measured but not tracked. No threshold. |
| 2 | Coverage > 60% overall. Reporting in CI. No gate. |
| 3 | Coverage > 80% on critical code. Quality gate. Trending visible. Branch coverage. |
| 4 | Coverage > 90%. Mutation testing. Coverage by risk area. Continuous improvement tracked. |

---

### QA-01a - Test strategy by criticality - Criticality: **should**

**Analyze:** Test prioritization by business risk, criticality mapping, differentiated coverage by area

**Check:**
- Critical areas identified (payment, auth, personal data)
- Coverage differentiated by criticality
- Critical path coverage (critical user journeys at 100%)
- Risk-based testing documented

**Commands:**
```bash
# Identify critical code areas
ls -d **/payment* **/auth* **/billing* **/checkout* 2>/dev/null
# Check whether criticality tags exist
grep -ri "critical\|high-risk\|business-critical" tests/ 2>/dev/null | head -10
```

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No prioritization. Uniform or random tests. |
| 1 | Focus on new code. Legacy not covered. |
| 2 | Mapping of critical areas. Differentiated coverage. |
| 3 | Risk-based testing. Business impact analysis. Critical paths fully covered. |
| 4 | Automated risk assessment. Test generation for high-risk areas. Coverage intelligence. |

---

### QA-02 - Post-deployment smoke tests - Criticality: **must**

**Analyze:** Post-deploy smoke-test scripts, health checks, automatic rollback

**Check:**
- Automated smoke tests after every deployment
- Verification of critical journeys (auth, payment, core features)
- Execution in < 5 minutes
- Automatic rollback if smoke tests fail
- Continuous synthetic monitoring in production

**Commands:**
```bash
# Look for smoke tests or health checks
find . -name "*smoke*" -o -name "*health*" -o -name "*sanity*" 2>/dev/null | head -10
grep -ri "smoke\|health.check\|post.deploy" .github/ .gitlab-ci.yml scripts/ 2>/dev/null
grep -ri "rollback" .github/ .gitlab-ci.yml scripts/ 2>/dev/null
```

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No smoke tests. Validation by users. |
| 1 | Manual verification of the main endpoints. |
| 2 | Automated smoke tests for the happy path. < 5 min. |
| 3 | Complete smoke tests (auth, payment, critical flows). Auto rollback on failure. |
| 4 | Continuous synthetic monitoring. Real user validation. Progressive rollout gated by smoke tests. |

---

### QA-03 - Single artifact promotion - Criticality: **should**

**Analyze:** Build pipeline, artifact registry, promotion strategy across environments

**Check:**
- Single build (Docker image, JAR) promoted across environments
- Externalized configuration (env vars, secret manager)
- No rebuild per environment
- Artifact signing (Cosign, Docker Content Trust)
- SLSA provenance

**Commands:**
```bash
# Check build/deploy pipeline
grep -ri "build\|push\|deploy\|promote" .github/workflows/ .gitlab-ci.yml 2>/dev/null | head -20
# Check externalized config
ls .env* docker-compose*.yml 2>/dev/null
grep -ri "vault\|secret.manager\|ssm\|configmap" . --include="*.yml" --include="*.yaml" 2>/dev/null | head -10
# Check signing
grep -ri "cosign\|content.trust\|slsa" .github/ .gitlab-ci.yml 2>/dev/null
```

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | Rebuild per environment. Different images in prod. |
| 1 | Same code promoted but rebuilt. Different config. |
| 2 | Single artifact (Docker image, JAR). Externalized config. Manual promotion. |
| 3 | Automated promotion pipeline. Immutable artifacts. Signed images. |
| 4 | GitOps with declarative promotion. Artifact provenance (SLSA). Supply chain security. |

---

### QA-04 - CI/CD quality gates - Criticality: **must**

**Analyze:** Branch protection, SonarQube quality gates, mandatory CI before merge

**Check:**
- CI must pass to merge (branch protection)
- Strict quality gates (tests, lint, coverage, security)
- Bypass impossible or tracked and exceptional
- Progressive gates (stricter toward prod)
- CODEOWNERS configured

**Commands:**
```bash
# Branch protection and CI config
ls .github/workflows/ .gitlab-ci.yml Jenkinsfile 2>/dev/null
cat CODEOWNERS .github/CODEOWNERS 2>/dev/null
# Quality gates
grep -ri "sonar\|quality.gate" sonar-project.properties .github/ 2>/dev/null
# Check branch protection via the API if possible
gh api repos/{owner}/{repo}/branches/main/protection 2>/dev/null | head -20
```

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No quality gates. Merge possible even if CI is red. |
| 1 | CI must pass to merge. Gates manually bypassable. |
| 2 | Strict quality gates (tests, lint). Bypass tracked and exceptional. |
| 3 | Complete gates (unit, integration, SAST, coverage). No bypass possible. Branch protection. |
| 4 | ML-powered quality prediction. Risk-based gates. Automated security review. DAST integrated. |

---

### QA-05 - CI/CD feedback speed - Criticality: **should**

**Analyze:** CI pipeline duration, parallelization, caching, flaky tests

**Check:**
- CI pipeline time (target < 10 min)
- Job parallelization (lint, tests, SAST in parallel)
- Caching of dependencies and build
- Flaky-test handling (quarantine)
- Predictive test selection

**Commands:**
```bash
# Analyze the pipeline structure
cat .github/workflows/*.yml .gitlab-ci.yml 2>/dev/null | grep -E "cache|parallel|needs:|depends_on" | head -20
# Check caching
grep -ri "cache\|turbo\|nx" .github/ .gitlab-ci.yml package.json 2>/dev/null | head -10
# Duration of the last builds
gh run list --limit 5 2>/dev/null
```

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | CI > 30 min. Devs do not wait for the result. |
| 1 | CI 15-30 min. Frequent context switch. |
| 2 | CI < 15 min. Basic optimizations (cache, parallelism). |
| 3 | CI < 10 min. Test parallelization. Incremental builds. Flaky test quarantine. |
| 4 | CI < 5 min for fast feedback. Predictive test selection. Distributed builds. Real-time feedback. |

---

### QA-06 - Code quality & debt - Criticality: **should**

**Analyze:** ESLint/Biome/Pylint configs, SonarQube, cyclomatic complexity, duplication, code smells

**Check:**
- Linter configured and active
- Formatter configured (Prettier, Black, rustfmt)
- Complexity measurement (cyclomatic, cognitive)
- Code duplication measured
- Technical debt tracked (SonarQube, CodeClimate)
- Pre-commit hooks (husky, lint-staged, lefthook)

**Commands:**
```bash
# Linters and formatters
ls .eslintrc* eslint.config.* .prettierrc* biome.json .phpcs.xml* 2>/dev/null
# Pre-commit hooks
ls .husky/ .lefthook.yml 2>/dev/null
grep "lint-staged\|husky\|lefthook" package.json 2>/dev/null
# SonarQube
ls sonar-project.properties .sonarcloud.properties 2>/dev/null
# Complexity
grep -ri "complexity\|max-depth\|max-lines" eslint.config.* .eslintrc* 2>/dev/null
```

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No quality measurement. Code review is the only source of feedback. |
| 1 | Basic lint (ESLint, Prettier). No complexity measurement. |
| 2 | SonarQube or equivalent. Metrics visible. No gate. |
| 3 | Quality gate on new issues. Technical debt ratio tracked. Clean as you code. |
| 4 | Quality metrics in the IDE. Automated refactoring suggestions. Architecture compliance. Cognitive complexity limits. |

---

### QA-07 - Dependency security (SCA) - Criticality: **must**

**Analyze:** SCA tools (Snyk, Trivy, Dependabot), SBOM, license compliance

**Check:**
- Dependency scanning in CI (npm audit, Snyk, Trivy)
- Gate on critical/high vulnerabilities
- SBOM generated (CycloneDX, SPDX)
- Remediation SLA by severity
- License compliance

**Commands:**
```bash
# SCA tools
grep -ri "snyk\|trivy\|dependabot\|dependency.check" .github/ .gitlab-ci.yml 2>/dev/null
ls .github/dependabot.yml renovate.json .snyk 2>/dev/null
# Check npm audit
npm audit --json 2>/dev/null | head -5
# SBOM
grep -ri "sbom\|cyclonedx\|spdx" .github/ Makefile 2>/dev/null
```

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No dependency scanning. Vulnerabilities unknown. |
| 1 | npm audit / dependabot enabled. Alerts often ignored. |
| 2 | SCA in CI (Snyk, Trivy). Gate on critical vulnerabilities. |
| 3 | SCA with remediation guidance. Fix SLA by severity. SBOM generated. |
| 4 | Continuous monitoring. License compliance. Malicious package detection. VEX. |

---

### QA-07a - Dependency update process - Criticality: **should**

**Analyze:** Dependabot/Renovate, auto-merge patches, upgrade sprints

**Check:**
- Automatic PRs for updates (Dependabot, Renovate)
- Auto-merge for security patches
- Dedicated sprints for major updates
- Compatibility tests on update PRs
- No dependencies frozen for > 1 year

**Commands:**
```bash
# Dependabot / Renovate config
cat .github/dependabot.yml renovate.json 2>/dev/null
# Check the age of dependencies
npm outdated 2>/dev/null | head -20
composer outdated 2>/dev/null | head -20
```

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | Manual and rare updates. Frequent breaking changes. |
| 1 | Dependabot/Renovate enabled. Automatic PRs but slow manual review. |
| 2 | Auto-merge for patches. Review for minors/majors. |
| 3 | Automated testing of updates. Scheduled upgrade sprints. Changelog review. |
| 4 | Continuous dependency updates. Automated compatibility testing. Zero-day patch automation. |

---

### QA-08 - Incident reproducibility - Criticality: **should**

**Analyze:** Staging environment, snapshots, request replay, debug tools

**Check:**
- Staging close to prod (infra, anonymized data)
- Ability to replay the requests that triggered a bug
- Restorable state snapshots
- Time-travel debugging available
- Documented reproduction procedure

**Commands:**
```bash
# Environments
grep -ri "staging\|preprod\|sandbox" docker-compose*.yml .env* 2>/dev/null | head -10
# Replay/debug tools
grep -ri "goreplay\|replay\|debug" scripts/ 2>/dev/null
# Data seeds / fixtures
find . -name "*seed*" -o -name "*fixture*" -o -name "*factory*" 2>/dev/null | head -10
```

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No reproducibility. Debugging in prod. |
| 1 | Logs for analysis. Manual reproduction difficult. |
| 2 | Staging environment close to prod. Reproduction possible with effort. |
| 3 | Restorable client-state snapshot. Request replay. Non-intrusive debugging. |
| 4 | Time-travel debugging. Production replay in sandbox. Automated reproduction. Observability-driven debugging. |

---

### QA-09 - Realistic test datasets - Criticality: **should**

**Analyze:** Fixtures, seeds, anonymized data, synthetic data generation, property-based testing

**Check:**
- Datasets representative of prod (volume, diversity)
- Anonymization of prod data for tests
- Synthetic data generation (Faker, etc.)
- Property-based testing (fast-check, Hypothesis)
- Edge cases covered (unicode, boundary values, volumes)

**Commands:**
```bash
# Seeds / factories
find . -name "*seed*" -o -name "*factory*" -o -name "*faker*" 2>/dev/null | head -10
grep -ri "faker\|factory\|seed" package.json composer.json 2>/dev/null
# Property-based testing
grep -ri "fast-check\|hypothesis\|quickcheck\|property.test" package.json tests/ 2>/dev/null
```

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | Minimal or nonexistent test data. Happy path only. |
| 1 | Manual fixtures. Not representative of prod. |
| 2 | Golden dataset anonymized from prod. Occasional refresh. |
| 3 | Realistic data generation. Edge cases covered. Property-based testing. |
| 4 | Synthetic data generation. Prod-like distribution. Continuous data quality. Chaos data injection. |

---

### QA-10 - Application profiling - Criticality: **could**

**Analyze:** APM (Datadog, New Relic), continuous profiling, flame graphs, SQL query analysis

**Check:**
- APM configured (Datadog, New Relic, Elastic APM)
- Dev profiling available (xdebug, Chrome DevTools)
- Continuous profiling in prod (Pyroscope, Datadog Profiler)
- SQL query analysis (slow queries, N+1 detection)
- Memory leak detection

**Commands:**
```bash
# APM / profiling
grep -ri "datadog\|newrelic\|elastic.apm\|sentry\|pyroscope" package.json composer.json .env* 2>/dev/null
grep -ri "xdebug\|blackfire" php.ini docker-compose*.yml 2>/dev/null
# N+1 detection
grep -ri "bullet\|nplusone\|telescope" composer.json package.json 2>/dev/null
```

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No profiling. Performance issues discovered in prod. |
| 1 | Ad-hoc profiling when a problem is reported. |
| 2 | Basic APM (New Relic, Datadog). Main metrics visible. |
| 3 | Continuous profiling. Flame graphs. SQL query analysis. Memory leak detection. |
| 4 | Always-on profiling in prod. Performance regression detection. Automated optimization suggestions. |

---

### QA-11 - CI/CD security - Criticality: **must**

**Analyze:** Secret scanning, ephemeral runners, signed commits, SLSA compliance

**Check:**
- Secret scanning in CI (GitLeaks, TruffleHog)
- Secrets in a secret manager (not in plaintext env vars)
- Ephemeral runners (no persistence between jobs)
- Signed commits for protected branches
- SAST integrated into the pipeline (Semgrep, CodeQL)

**Commands:**
```bash
# Secret scanning
grep -ri "gitleaks\|trufflehog\|secret.scan" .github/ .gitlab-ci.yml .pre-commit-config.yaml 2>/dev/null
# SAST
grep -ri "semgrep\|codeql\|sast\|bandit\|phpstan\|psalm" .github/ .gitlab-ci.yml 2>/dev/null
# Signed commits
git log --show-signature -1 2>/dev/null | head -5
# Check whether secrets are in plaintext in the repo
grep -ri "password\|secret\|api.key" .env 2>/dev/null | head -5
```

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | Shared runners. Secrets in environment variables. No scan. |
| 1 | Dedicated runners. Secrets in a secret manager. No scan. |
| 2 | Secret scanning in CI (GitLeaks). Basic SAST. Least privilege for runners. |
| 3 | SAST + DAST. Signed commits. Versioned pipeline-as-code. Audit trail. |
| 4 | Zero-trust CI/CD. Ephemeral runners. SLSA Level 3+. Supply chain attestation. Hermetic builds. |

---

### QA-12 - Product-oriented observability - Criticality: **should**

**Analyze:** Business SLOs, customer-impact dashboards, feature usage tracking, technical-business correlation

**Check:**
- Business KPIs defined (conversion rate, activation, retention)
- Unified technical + business dashboard
- SLOs on user journeys (not only on infra)
- Alerts on business-metric degradation
- Feature usage tracking (Amplitude, Mixpanel, PostHog)

**Commands:**
```bash
# Product analytics
grep -ri "amplitude\|mixpanel\|posthog\|segment\|analytics" package.json .env* 2>/dev/null
# SLOs
grep -ri "slo\|error.budget\|conversion\|funnel" . --include="*.yml" --include="*.yaml" 2>/dev/null | head -10
# Feature flags
grep -ri "launchdarkly\|feature.flag\|unleash\|flagsmith" package.json .env* 2>/dev/null
```

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | Technical metrics only. No business view. |
| 1 | A few business metrics in separate dashboards. |
| 2 | Business KPIs defined. Unified technical + business dashboard. |
| 3 | Business SLOs (conversion, activation). Alerts on business degradation. Customer impact visible. |
| 4 | Product analytics integrated. Feature usage tracking. Business impact correlation. Data-driven decisions. |

---

### QA-13 - Code review process - Criticality: **must**

**Analyze:** PR workflow, CODEOWNERS, review SLA, review guidelines

**Check:**
- Mandatory reviews via PR before merge
- At least 1 reviewer required (2 for critical code)
- CODEOWNERS configured
- Review guidelines documented
- Review SLA < 4h tracked
- PR size < 400 lines

**Commands:**
```bash
# CODEOWNERS
cat CODEOWNERS .github/CODEOWNERS 2>/dev/null
# Branch protection
gh api repos/{owner}/{repo}/branches/main/protection 2>/dev/null | head -20
# Review guidelines
ls CONTRIBUTING.md .github/CONTRIBUTING.md .github/pull_request_template.md 2>/dev/null
# Size of recent PRs
gh pr list --state merged --limit 5 --json additions,deletions 2>/dev/null
```

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No code review. Direct merge to the main branch. |
| 1 | Optional reviews. No guidelines. Review time not tracked. |
| 2 | Mandatory reviews via PR. At least 1 reviewer required. Basic guidelines. |
| 3 | Documented guidelines. SLA on review time. Multiple reviewers for critical paths. CODEOWNERS. |
| 4 | Automated assistance (AI/linters). Review metrics tracked. Reviewer rotation. Pair/mob programming. |

---

### QA-14 - DORA metrics - Criticality: **should**

**Analyze:** Deployment Frequency, Lead Time for Changes, Change Failure Rate, MTTR

**Check:**
- The 4 DORA metrics are known to the team
- Automated measurement (Sleuth, LinearB, Jellyfish, DORA dashboard)
- Targets defined per metric
- Dashboards visible to the team
- Improvement cycles based on the metrics

**Commands:**
```bash
# Deployment frequency (approximation)
gh release list --limit 10 2>/dev/null
git log --oneline --since="1 month ago" --merges 2>/dev/null | wc -l
# Lead time (approximation via PRs)
gh pr list --state merged --limit 5 --json createdAt,mergedAt 2>/dev/null
```

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No delivery metric tracked. |
| 1 | Awareness of DORA metrics but no measurement in place. |
| 2 | Manual measurement of some metrics (e.g. deployment frequency). |
| 3 | Automated tracking of the 4 metrics. Visible dashboards. Targets defined. |
| 4 | Improvement cycles driven by the metrics. Elite targets. Predictive analytics on delivery performance. |

---

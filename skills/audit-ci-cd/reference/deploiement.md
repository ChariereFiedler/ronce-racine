# Deployment & Environments section

Questions: ci-02 (CD pipeline), ci-06 (Environment management), ci-09 (Rollback & recovery).

## Table of contents

- [ci-02 - CD pipeline and deployment strategies](#ci-02--cd-pipeline-and-deployment-strategies--must)
- [ci-06 - Environment management (dev, staging, preprod, prod)](#ci-06--environment-management-dev-staging-preprod-prod--must)
- [ci-09 - Deployment rollback and recovery](#ci-09--deployment-rollback-and-recovery--must)

---

### ci-02 - CD pipeline and deployment strategies - `must`

**Analyze:** Deployment scripts, Kubernetes configs (Helm charts, kustomize), Terraform/Pulumi, docker-compose, ArgoCD/Flux configs

**Commands:**
- `grep -E "deploy|release|promote|deliver" .gitlab-ci.yml .github/workflows/*.yml 2>/dev/null` → detect deployment steps
- `ls Dockerfile docker-compose*.yml 2>/dev/null` → detect containerization
- `ls -d helm/ charts/ kustomize/ argocd/ 2>/dev/null` → detect K8s orchestration
- `grep -E "blue.green|canary|rolling|progressive" .gitlab-ci.yml .github/workflows/*.yml helm/*/values*.yml 2>/dev/null` → identify the deployment strategy
- `grep -E "approval|manual|when:.*manual" .gitlab-ci.yml .github/workflows/*.yml 2>/dev/null` → check the approval gates
- `grep -E "feature.flag|unleash|launchdarkly|flipper" package.json src/ 2>/dev/null` → detect feature flags

**Check:**
- Defined deployment strategy (rolling, blue-green, canary)
- Artifact promotion between environments (no rebuild)
- Environment separation (dev, staging, preprod, prod)
- Approval gates before production
- Feature flags for deploy/release decoupling
- GitOps with automatic reconciliation (ArgoCD, Flux)

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | Manual deployments (SSH, FTP, file copy). No automation. |
| 1 | Semi-automated deployment scripts. All-or-nothing deployment. Planned downtime during production releases. |
| 2 | Automated CD pipeline with rolling updates. Zero-downtime deployment. Deployment triggered manually after validation. |
| 3 | Automated canary or blue-green deployment. Feature flags to decouple deployment and activation. Automatic promotion between environments. |
| 4 | GitOps with automatic reconciliation. Automated canary analysis (metrics + auto rollback). Feature flags with advanced targeting (% users, segments). Continuous deployment to production several times a day. |

---

### ci-06 - Environment management (dev, staging, preprod, prod) - `must`

**Analyze:** docker-compose, environment configs, env variables, provisioning scripts

**Commands:**
- `grep -ri "staging\|preprod\|dev\|prod\|review" .gitlab-ci.yml docker-compose*.yml .github/workflows/*.yml 2>/dev/null` → identify the environments
- `ls .env .env.* env/ environments/ 2>/dev/null` → environment files
- `grep -ri "vault\|secret.manager\|sealed.secret\|sops\|age" .gitlab-ci.yml .github/workflows/*.yml 2>/dev/null` → secret management
- `grep -ri "environment:" .gitlab-ci.yml .github/workflows/*.yml 2>/dev/null` → environments declared in CI
- `grep -ri "preview\|ephemeral\|dynamic" .gitlab-ci.yml .github/workflows/*.yml 2>/dev/null` → ephemeral environments

**Check:**
- Separate environments (dev, staging, preprod, prod)
- Parity between environments (same stack, same config except secrets)
- Environment variable management (vault, secrets manager vs. hardcoded .env)
- Ephemeral environments for PRs (preview deployments)
- Self-service for developers (environment creation without ops)

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | A single environment (prod) or very different environments. Manual configuration. No staging. |
| 1 | Distinct dev and prod environments but with significant differences. Manual configuration by documentation. |
| 2 | dev, staging, prod environments with good parity. Configuration managed through environment variables. Semi-automated provisioning. |
| 3 | Full dev/staging/prod parity. Environments defined as code. Drift detection. Preview environments per PR. |
| 4 | Ephemeral environments on demand. Full self-service. Parity verified automatically. Environments created and destroyed in < 10 min. |

---

### ci-09 - Deployment rollback and recovery - `must`

**Analyze:** Documented rollback procedures, rollback scripts, health check configs, database migrations

**Commands:**
- `grep -ri "rollback\|revert\|previous\|recovery" docs/ scripts/ 2>/dev/null` → documented rollback procedures
- `grep -ri "health.check\|readiness\|liveness\|startup.probe" helm/ k8s/ docker-compose*.yml Dockerfile 2>/dev/null` → health checks
- `grep -ri "rollback\|undo\|restore" .gitlab-ci.yml .github/workflows/*.yml Makefile 2>/dev/null` → automated rollback
- `grep -ri "migration.*down\|reversible\|revert" db/ migrations/ database/ 2>/dev/null | head -10` → reversible migrations
- `grep -ri "feature.flag\|kill.switch\|toggle" src/ 2>/dev/null | head -5` → feature flags kill switch
- `grep -ri "expand.*contract\|backward.*compat" docs/ migrations/ 2>/dev/null` → expand/contract pattern

**Check:**
- Documented and tested rollback procedure
- Automatic rollback on health check failure or metric degradation
- Rollback time < 5 min
- Database: reversible migrations or expand/contract pattern
- Feature flags kill switch for instant deactivation
- Immutable artifacts (redeploy version N-1 with no rebuild)

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No rollback procedure. Forward-fix only (hotfix). Recovery time > 4h. |
| 1 | Documented manual rollback. Procedure known but rarely tested. Non-reversible database migrations. |
| 2 | One-command automated rollback (redeploy version N-1). Reversible migrations. Recovery time < 30 min. |
| 3 | Automatic rollback triggered by smoke tests or SLO degradation. Feature flags kill switch. Expand/contract pattern for migrations. Recovery < 10 min. |
| 4 | Automatic rollback with canary analysis. Zero-downtime rollback. All migrations backward-compatible by design. Recovery < 2 min. Chaos engineering on rollback procedures. |

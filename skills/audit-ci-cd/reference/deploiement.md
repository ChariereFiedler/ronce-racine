# Deployment & Environments section

Questions: ci-02 (CD pipeline), ci-06 (Environment management), ci-11 (Access to non-production environments), ci-09 (Rollback & recovery).

## Table of contents

- [ci-02 - CD pipeline and deployment strategies](#ci-02--cd-pipeline-and-deployment-strategies--must)
- [ci-06 - Environment management (dev, staging, preprod, prod)](#ci-06--environment-management-dev-staging-preprod-prod--must)
- [ci-11 - Access to non-production environments](#ci-11--access-to-non-production-environments--must)
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

### ci-11 - Access to non-production environments - `must`

ci-06 rewards having staging and a preview per PR; this question asks what those environments expose, and to whom. A preview or staging URL runs production code without production's safeguards, and it exposes five kinds of things:
- **Secrets**: production keys bound to the preview, keys built into the client bundle, source maps that publish the source, verbose errors and stack traces that reveal internals, environment variables echoed by a debug page.
- **Hidden features**: what is switched on only outside production - debug routes, admin or "login as" shortcuts, cheat codes, seeded admin accounts, disabled rate limits or payment checks. In production they do not exist; on a reachable preview they are a way in.
- **Upcoming features**: work that is not public yet - unannounced products, redesigns, pricing, partners, content under embargo. A preview publishes them before their release, and screenshots outlive any takedown. The same leak happens in production when the client bundle ships the code, routes or flag names of features still turned off.
- **Data and privacy**: a copy of production data, a shared database, or seeded accounts holding real names, emails or customer records. Personal data copied into staging is still personal data: it counts as processing, with the same obligations as production.
- **Infrastructure**: a preview runs code nobody has reviewed yet - sometimes from a fork - with its hidden features on. Hosted on production's infrastructure (same cluster, network, cloud account, database server or service identity), or on premise inside the internal network, a compromised preview is a foothold into production or the internal network. Non-production belongs on separate infrastructure in the first place.

Anyone holding a URL that answers without authentication can see it, and a URL leaks through logs, referrers, chat messages and link previews. Search-engine indexing only makes the exposure wider; noindex is a backstop, never the protection. A static preview is no exception: it still publishes upcoming content.

**Analyze:** how preview and staging URLs are generated (platform default domains, predictable subdomains), what stands in front of them (identity-aware proxy, platform access control, basic auth, IP allowlist), which secrets they get and whether any end up in what the client downloads, what is switched on only outside production (flags, debug routes, shortcuts, seeded accounts, verbose errors), which unreleased features they show and whether the production bundle already ships them, where their data comes from (synthetic, pseudonymized, production copy, production database itself), and where they run (separate account / cluster / network from production, or alongside it; cloud or on premise)

**Commands:**
- `grep -riE "preview|staging|review[-_ ]app|ephemeral" . --include="*.yml" --include="*.yaml" --include="*.json" --include="*.jsonc" --include="*.toml" 2>/dev/null | grep -v -e node_modules -e package-lock | head -20` → where non-production environments are declared
- `grep -rniE "basic[-_ ]?auth|htpasswd|ip[-_ ]?(allow|restrict)|allowlist|whitelist|oauth2[-_]proxy|identity[-_ ]aware|access[-_ ]?polic|password[-_ ]?protect|deployment[-_ ]?protection|sso[-_ ]?protection" . --include="*.yml" --include="*.yaml" --include="*.json" --include="*.jsonc" --include="*.toml" --include="*.tf" --include="*.conf" 2>/dev/null | grep -v -e node_modules -e package-lock | head -20` → access control declared as code
- `grep -rniE "pg_dump|pg_restore|mysqldump|mongodump|mongorestore|from[-_ ]prod|prod[-_ ]?(dump|snapshot|copy|clone)|anonymi[sz]|pseudonymi[sz]|faker|seed" . --include="*.yml" --include="*.yaml" --include="*.json" --include="*.toml" --include="*.ts" --include="*.js" --include="*.py" --include="*.sql" --include="Makefile" 2>/dev/null | grep -v -e node_modules -e package-lock | head -20` → where non-production data comes from (a production copy, or synthetic / pseudonymized data)
- `grep -rniE "(NEXT_PUBLIC|VITE|REACT_APP|NUXT_PUBLIC|PUBLIC)_[A-Z0-9_]*(SECRET|TOKEN|KEY|PASSWORD)|source-?maps?\s*[:=]\s*(true|['\"])|productionSourceMap\s*:\s*true|devtool\s*:" . --include="*.ts" --include="*.js" --include="*.mjs" --include="*.json" --include="*.env*" --include="*.yml" --include="*.yaml" 2>/dev/null | grep -v node_modules | head -20` → secrets shipped to the client, source maps served
- `grep -rniE "(isProd|isDev|production|NODE_ENV|ENVIRONMENT|APP_ENV)\s*(!==|!=|===|==)|import\.meta\.env\.(DEV|PROD)|DEBUG\s*[:=]\s*(true|1)" src app lib 2>/dev/null | head -20` → behaviour that differs outside production (debug switches, shortcuts, verbose errors)
- `grep -rniE "feature[-_ ]?flags?|launchdarkly|unleash|flagsmith|growthbook|openfeature|isEnabled\(|useFlag|coming[-_ ]soon|unreleased|beta[-_ ]?only|embargo" src app lib 2>/dev/null | head -20` → upcoming features and how they are gated (a flag evaluated in the client ships the feature's code and name to everyone)
- `grep -rniE "namespace|cluster|account[-_ ]?id|project[-_ ]?id|subscription[-_ ]?id|vpc|subnet|db[-_ ]?host|database[-_ ]?url|service[-_ ]?account|role[-_ ]?arn" . --include="*.yml" --include="*.yaml" --include="*.tf" --include="*.tfvars" --include="*.toml" --include="*.json" 2>/dev/null | grep -v -e node_modules -e package-lock | head -30` → where non-production runs, next to the production values (the same cluster, account, network or database host on both sides = shared infrastructure)
- `grep -rniE "noindex|x-robots-tag|disallow:\s*/\s*$" . --include="*.txt" --include="*.html" --include="_headers" --include="*.json" --include="*.toml" --include="*.ts" --include="*.js" --include="*.conf" 2>/dev/null | grep -v node_modules | head -10` → backstop: kept out of search engines

**Check:**
- Preview and staging URLs require authentication (SSO / identity-aware proxy, platform access control, or at least basic auth), or are reachable only from a private network
- The protection is declared as code or documented, and applies to every new preview automatically, not one by one
- **Secrets**: non-production environments get their own secrets, scoped to what they need, never production's (rotation is SE-03 in `audit-security`); nothing secret is in what the client downloads; source maps, verbose errors and environment dumps are not served without that protection
- **Hidden features**: what is switched on only outside production (debug routes, admin or impersonation shortcuts, seeded admin accounts, relaxed checks) is listed, and is never reachable without that protection
- **Upcoming features**: unreleased features are shown only behind that protection; in production, a feature still turned off is not shipped to the client (flag evaluated server-side, or the code stripped at build), so its code, routes and name do not leak
- **Data and privacy**: non-production environments never read or write a production data store, and hold no production copy unless it is pseudonymized or anonymized first (the quality of that anonymization is CO-02 / CO-02a in `audit-compliance`)
- **Infrastructure**: non-production runs on infrastructure separate from production (its own account or project, cluster, network and database server, its own service identities with no production permission); when it runs on premise, it is segmented from the internal network and production, not merely behind the same firewall (the perimeter itself is SE-12 in `audit-security`)
- Non-production responses carry `X-Robots-Tag: noindex` (or a disallow-all `robots.txt`) as a backstop for a leaked link

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | A non-production environment is reachable without authentication and exposes more than production does: secrets (production keys, source maps, verbose errors), hidden features (debug routes, shortcuts, seeded admin accounts), upcoming features, or production or personal data. Or it reads or writes a production data store, or shares production's infrastructure (cluster, network, account, service identity). |
| 1 | Reachable without authentication, relying on the URL staying secret. Nothing of the above found, but secrets, hidden features, upcoming features and data origin are not inventoried, so a leak is not ruled out. |
| 2 | Staging is protected (basic auth, IP allowlist or platform access control), but previews are public or protected one by one. Secrets are separate per environment; non-production data is synthetic or pseudonymized; non-production does not share production's database or service identities. |
| 3 | Every non-production environment, previews included, sits behind identity-based access applied automatically and declared as code. Secrets, hidden features, upcoming features and data origin are inventoried; no production secret, production data or personal data outside production; nothing secret in the client, no public source maps or verbose errors; features still off in production are not shipped to its client. Non-production runs on infrastructure separate from production (and segmented from the internal network when on premise). noindex as a backstop. |
| 4 | Level 3, plus access is audited (who opened which preview), previews and their data expire automatically, and a check in CI fails when a non-production URL answers without authentication. |

N/A when the project has no reachable non-production environment (ci-06 already scores its absence).

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

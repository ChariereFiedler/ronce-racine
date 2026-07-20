# DORA Metrics section

Questions: ci-03 (Deployment frequency), ci-04 (Lead time for changes), ci-05 (Change failure rate).

## Table of contents

- [ci-03 - Deployment frequency (DORA metric)](#ci-03--deployment-frequency-dora-metric--could)
- [ci-04 - Lead time for changes (DORA metric)](#ci-04--lead-time-for-changes-dora-metric--could)
- [ci-05 - Change failure rate (DORA metric)](#ci-05--change-failure-rate-dora-metric--could)

---

### ci-03 - Deployment frequency (DORA metric) - `could`

**Analyze:** Deployment frequency via git log/tags, release history, CI/CD dashboards

**Commands:**
- `git tag --sort=-creatordate | head -20` → release frequency (dates of the latest tags)
- `git log --oneline --since="30 days" | wc -l` → recent activity
- `git log --oneline --since="30 days" --grep="deploy\|release" | wc -l` → deployment frequency
- `git log --merges --oneline --since="90 days" | head -20` → merge cadence
- `git log --format="%ad" --date=short --tags --since="180 days" | sort -u | head -30` → release dates over 6 months
- `grep -ri "dora\|deployment.frequency" docs/ 2>/dev/null` → documented metrics

**Check:**
- Deployment frequency measured and known
- Trend (improvement or degradation over recent months)
- Identified obstacles to a higher frequency
- Trunk-based development vs. long-lived branches (impacts frequency)

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | Rare deployments (< 1 per month). Releases planned far in advance. |
| 1 | Monthly or bi-monthly deployment. Heavy release process with manual coordination. |
| 2 | Weekly deployment. Documented and repeatable process. Defined deployment windows. |
| 3 | Daily or several times a week. On demand. Trunk-based development. Small batches. |
| 4 | Continuous deployment multiple times a day. Every validated commit can reach production automatically. Frequency measured and continuously optimized. |

---

### ci-04 - Lead time for changes (DORA metric) - `could`

**Analyze:** Time between the first commit and production deployment, review duration, CI pipeline duration

**Commands:**
- `git log --merges --format="%H %ad" --date=iso --since="90 days" | head -20` → recent merge dates
- `grep -ri "lead.time\|cycle.time\|value.stream" docs/ 2>/dev/null` → documented metrics
- `grep -E "timeout|max.*time|deadline" .github/workflows/*.yml .gitlab-ci.yml 2>/dev/null` → pipeline timeouts
- `git log --format="%ae %ad" --date=iso --since="30 days" | head -20` → contributor activity

**Check:**
- Lead time measured (from the first commit to production deployment)
- Lead time breakdown (dev, review, CI, deployment wait, deployment)
- Bottlenecks identified (slow review, long pipeline, release window)
- Value stream mapping performed
- Reasonably sized PRs (< 400 lines)

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | Lead time not measured. Estimated at several weeks or months. |
| 1 | Lead time measured informally. Between 1 week and 1 month. Bottlenecks identified but not addressed. |
| 2 | Lead time between 1 day and 1 week. Value stream mapping performed. Main waits reduced. |
| 3 | Lead time < 1 day. Automated quality gates. Small PRs reviewed quickly (< 4h). Deployment on the same day as the merge. |
| 4 | Lead time < 1 hour. Continuous deployment. Trunk-based development. Zero manual step between commit and production. Metric tracked in real time. |

---

### ci-05 - Change failure rate (DORA metric) - `could`

**Analyze:** History of post-deployment incidents, rollbacks, hotfixes, post-mortems

**Commands:**
- `git log --oneline --since="90 days" --grep="hotfix\|revert\|rollback\|fix.*deploy\|fix.*prod" | head -20` → recent hotfixes and reverts
- `git log --oneline --since="90 days" --grep="revert" | wc -l` → number of reverts
- `grep -ri "change.failure\|failure.rate\|post.mortem\|postmortem\|incident" docs/ 2>/dev/null` → documented metrics and process
- `grep -ri "slo\|sli\|error.budget" docs/ src/ 2>/dev/null` → defined SLOs

**Check:**
- Change failure rate measured (% of deployments causing an incident)
- Clear definition of what constitutes a "failure" (P1/P2 incident, rollback, hotfix)
- Blameless post-mortems performed after incidents
- Post-deployment smoke tests
- Correlation between quality metrics and failure rate

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | Change failure rate not measured. Frequent post-deployment incidents with no tracking. |
| 1 | Rate measured manually. Above 30%. No systematic root-cause analysis. |
| 2 | Rate measured automatically (15-30%). Post-mortems performed for major incidents. Corrective actions identified. |
| 3 | Rate between 5% and 15%. Systematic blameless post-mortems. Post-deployment smoke tests. Canary releases to reduce the blast radius. |
| 4 | Rate < 5%. Predictive analysis of deployment risks. Automated canary analysis. Documented continuous improvement. Correlation between quality metrics and failure rate. |

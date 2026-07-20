# E2E & flaky tests section

Questions: te-03 (Full-injection E2E tests), te-03a (Flaky test management).

## Table of contents

- [te-03 - Full-injection E2E tests](#te-03--full-injection-e2e-tests--should)
- [te-03a - Flaky test management](#te-03a--flaky-test-management--should)

---

### te-03 - Full-injection E2E tests - `should`

**Analyze:** Playwright, Cypress, Selenium files, e2e configs, e2e scripts in package.json

**Commands:**
- `ls playwright.config.* cypress.config.* 2>/dev/null` → detect the E2E framework
- `find . -name "*.e2e.*" -o -name "*.e2e-spec.*" 2>/dev/null | grep -v node_modules | wc -l` → count the E2E tests
- `find . -name "*.e2e.*" -o -name "*.e2e-spec.*" 2>/dev/null | grep -v node_modules | head -10` → list the E2E tests
- `grep -E "e2e|playwright|cypress|selenium" package.json 2>/dev/null` → E2E scripts in package.json
- `grep -E "e2e|playwright|cypress" .gitlab-ci.yml .github/workflows/*.yml 2>/dev/null` → E2E in CI
- `grep -ri "visual.*regress\|screenshot\|toMatchSnapshot\|toHaveScreenshot" . --include="*.ts" --include="*.js" 2>/dev/null | grep -v node_modules | head -5` → visual regression testing

**Check:**
- E2E framework configured (Playwright, Cypress)
- Coverage of critical journeys (happy path + error paths)
- Execution in the CI pipeline
- Prod-like test environment

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No automated E2E tests. Manual validation only. |
| 1 | A few documented manual E2E tests. Run before a major release. |
| 2 | Automated E2E suite for happy paths. Dedicated environment. Frequent flaky tests. |
| 3 | Complete E2E (happy + error paths). Stable. Integrated into CI/CD. Detailed reporting. |
| 4 | E2E in a prod-like environment. Canary testing. Visual regression. Performance baselines. |

---

### te-03a - Flaky test management - `should`

**Condition:** Applies if te-03 ≥ 2 (automated E2E suite in place).

**Analyze:** Retry configs (jest.retryTimes, Playwright retries), test reports, quarantine, flakiness metrics

**Commands:**
- `grep -r "retry\|retries\|flaky" vitest.config.* playwright.config.* jest.config.* 2>/dev/null` → retry configuration
- `grep -rn "\.skip\|xdescribe\|xit\|test\.skip\|it\.skip" . --include="*.test.*" --include="*.spec.*" 2>/dev/null | grep -v node_modules | wc -l` → count skipped tests
- `grep -ri "quarantine\|flaky\|unstable" . --include="*.test.*" --include="*.spec.*" 2>/dev/null | grep -v node_modules | head -10` → tests marked flaky/quarantine
- `grep -ri "retryTimes\|jest.retryTimes" . --include="*.test.*" --include="*.spec.*" 2>/dev/null | grep -v node_modules | head -5` → test-level retry
- `grep -ri "buildpulse\|flaky.*detect\|flaky.*track" . 2>/dev/null | head -5` → flakiness-tracking tools

**Check:**
- Flaky-test detection mechanism
- Quarantine policy (isolation vs immediate fix)
- Flakiness rate measured and tracked
- Systematic root-cause analysis

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | Flaky tests ignored or disabled. |
| 1 | Automatic retry. No root-cause analysis. |
| 2 | Flaky tests quarantined. Fix prioritized but not systematic. |
| 3 | Mandatory fix process. Flakiness metrics. Resolution SLA. |
| 4 | Near-zero flakiness (<1%). Automatic detection. Systematic root-cause analysis. |

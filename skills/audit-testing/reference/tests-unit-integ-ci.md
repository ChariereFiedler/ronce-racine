# Unit, integration & CI tests section

Questions: te-07 (Unit test structure), te-08 (Integration test structure), te-09 (Test execution in CI), te-09a (Test feedback loop).

## Table of contents

- [te-07 — Unit test structure](#te-07--unit-test-structure--must)
- [te-08 — Integration test structure](#te-08--integration-test-structure--must)
- [te-09 — Test execution in CI](#te-09--test-execution-in-ci--must)
- [te-09a — Test feedback loop](#te-09a--test-feedback-loop--should)

---

### te-07 — Unit test structure — `must`

**Analyze:** Test files (`*.test.ts`, `*.spec.ts`, `*_test.go`, `test_*.py`), Jest/Vitest/pytest configs

**Commands:**
- `find . -name "*.test.*" -o -name "*.spec.*" | grep -v e2e | grep -v node_modules | wc -l` → count the unit tests
- `find . -name "*.test.*" -o -name "*.spec.*" | grep -v e2e | grep -v node_modules | head -20` → list the unit tests
- `ls vitest.config.* jest.config.* pytest.ini pyproject.toml .mocharc.* 2>/dev/null` → detect the test framework
- `grep -E "coverage|threshold|branches|functions|lines|statements" vitest.config.* jest.config.* package.json 2>/dev/null` → coverage thresholds
- `grep -E "coverageThreshold|coverageReporters|--coverage" package.json vitest.config.* jest.config.* 2>/dev/null` → coverage configuration
- `grep -ri "mutation\|stryker\|pitest" package.json 2>/dev/null` → mutation testing

**Check:**
- Naming convention and organization (co-located vs `__tests__` folder)
- Arrange-Act-Assert pattern respected
- Isolation (no inter-test dependency)
- Coverage configured with thresholds

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No unit tests, or very few (<10% coverage). |
| 1 | Unit tests present but not maintained. Low coverage (<30%). |
| 2 | Established test framework. Coverage >50% on critical code. CI-integrated. |
| 3 | Coverage >80%. Fast tests (<5min). Occasional mutation testing. |
| 4 | TDD practiced. Coverage >90%. Mutation score >80%. Tests as documentation. |

---

### te-08 — Integration test structure — `must`

**Analyze:** Tests against a real database (Testcontainers, docker-compose test), API tests

**Commands:**
- `grep -ri "testcontainers\|docker-compose.*test\|supertest\|httptest" . 2>/dev/null | grep -v node_modules | head -5` → integration-test tools
- `find . -name "*integration*" -o -name "*integ*" 2>/dev/null | grep -v node_modules | head -10` → integration-test files
- `grep -ri "request(app)\|supertest\|httptest\|TestClient" . --include="*.test.*" --include="*.spec.*" 2>/dev/null | grep -v node_modules | head -5` → API tests
- `grep -E "test.*db\|test.*database\|:memory:" docker-compose*.yml vitest.config.* jest.config.* 2>/dev/null` → test DB
- `find . -name "*.test.*" -o -name "*.spec.*" | grep -v node_modules | xargs grep -l "import.*prisma\|import.*typeorm\|import.*sequelize\|import.*mongoose" 2>/dev/null | head -5` → tests with an ORM (integration)

**Check:**
- Integration tests against a real DB (not only mocks)
- Testcontainers or docker-compose for the test environment
- Coverage of critical component interactions
- Test pyramid respected (unit > integ > e2e)

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No dedicated integration tests. |
| 1 | A few manual integration tests. Shared environment. |
| 2 | Automated integration suite. Containers for dependencies. CI-integrated. |
| 3 | Complete integration tests with fixtures. Guaranteed isolation. Parallel execution. |
| 4 | Contract + integration tests combined. Service virtualization. Performance baselines. |

---

### te-09 — Test execution in CI — `must`

**Analyze:** CI pipeline, test stages, quality gates, uploaded coverage reports

**Commands:**
- `grep -E "test|vitest|jest|playwright|pytest|npm run test|yarn test" .gitlab-ci.yml .github/workflows/*.yml 2>/dev/null` → tests in CI
- `grep -E "coverage|codecov|coveralls|sonar" .gitlab-ci.yml .github/workflows/*.yml 2>/dev/null` → coverage reports in CI
- `grep -E "quality.gate\|fail\|threshold\|allow_failure" .gitlab-ci.yml .github/workflows/*.yml 2>/dev/null` → quality gates
- `grep -E "parallel|shard|split" .gitlab-ci.yml .github/workflows/*.yml 2>/dev/null` → test parallelization
- `grep -E "junit|test-results|test.report|allure" .gitlab-ci.yml .github/workflows/*.yml 2>/dev/null` → test reports

**Check:**
- Tests run automatically in CI (not only locally)
- Coverage report generated and visible
- Quality gate (PR blocked if tests fail or coverage drops)
- Reasonable execution time (< 15 min)

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No CI, or CI without tests. |
| 1 | CI with unit tests. Non-blocking. Results sometimes ignored. |
| 2 | Blocking CI with unit + integration. Build time <15min. |
| 3 | Complete pipeline (lint, unit, integration, E2E). Quality gates. Detailed reporting. |
| 4 | Optimized CI/CD (<10min). Parallel testing. Flaky detection. Coverage trends. |

---

### te-09a — Test feedback loop — `should`

**Condition:** Applies if te-09 ≥ 2 (blocking CI in place).

**Analyze:** CI feedback time, notifications, reports, test dashboards, caching, incremental execution

**Commands:**
- `grep -E "coverage|report|codecov|coveralls|sonar" .gitlab-ci.yml .github/workflows/*.yml 2>/dev/null` → coverage reports
- `grep -E "slack|teams|notify|webhook|comment" .gitlab-ci.yml .github/workflows/*.yml 2>/dev/null` → notifications
- `grep -E "cache|Cache|CACHE" .gitlab-ci.yml .github/workflows/*.yml 2>/dev/null` → caching in the pipeline
- `grep -E "nx\|turborepo\|bazel\|launchable" package.json .gitlab-ci.yml .github/workflows/*.yml 2>/dev/null` → incremental-execution tools
- `ls .codecov.yml codecov.yml sonar-project.properties 2>/dev/null` → configured reporting tools

**Check:**
- Fast feedback to developers (< 10 min ideal)
- Incremental or predictive test execution
- Effective caching (dependencies, build, test results)
- Readable test reports accessible on the PR

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | Feedback >30min. Developers do not wait. |
| 1 | Feedback 15-30min. Waiting but context switch. |
| 2 | Feedback <15min. Priority tests first. |
| 3 | Feedback <10min. Incremental testing. Fast feedback. |
| 4 | Feedback <5min for unit tests. Parallel execution. Predictive test selection. |

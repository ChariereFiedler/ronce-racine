# Golden dataset section

Questions: te-02 (Golden dataset), te-02a (Golden dataset maintenance).

## Table of contents

- [te-02 - Golden dataset (reference dataset)](#te-02--golden-dataset-reference-dataset--should)
- [te-02a - Golden dataset maintenance](#te-02a--golden-dataset-maintenance--should)

---

### te-02 - Golden dataset (reference dataset) - `should`

**Analyze:** Fixtures, seeds, factories, test-data files, seeding scripts

**Commands:**
- `find . -path "*/fixtures/*" -o -path "*/seeds/*" -o -path "*/factories/*" -o -path "*/__fixtures__/*" 2>/dev/null | grep -v node_modules | head -10` → test-data files
- `grep -ri "factory\|faker\|seed\|fixture" package.json 2>/dev/null` → data-generation libraries
- `find . -name "*.fixture.*" -o -name "*.seed.*" -o -name "*.factory.*" 2>/dev/null | grep -v node_modules | head -10` → fixture/seed/factory files
- `grep -ri "anonymi\|mask\|obfuscat" scripts/ docs/ 2>/dev/null | head -5` → production data anonymization
- `grep -ri "golden\|reference.*data\|dataset" docs/ README.md 2>/dev/null | head -5` → golden dataset documentation

**Check:**
- Reference dataset for the tests
- Data representative of production (anonymized)
- Versioning of the golden dataset alongside the code
- Edge-case coverage in the data

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No golden dataset. Tests with ad-hoc data. |
| 1 | A few manually maintained test files. Not versioned. |
| 2 | Versioned golden dataset for the main cases. Partial coverage. |
| 3 | Complete dataset covering edge cases. Versioned with the code. Regular refresh. |
| 4 | Dataset generated automatically from production (anonymized). Coverage metrics. Mutation testing. |

---

### te-02a - Golden dataset maintenance - `should`

**Condition:** Applies if te-02 ≥ 2 (golden dataset in place).

**Analyze:** Test-data update process, refresh pipeline, bug-to-test workflow

**Commands:**
- `git log --oneline --all -- "*fixtures*" "*seeds*" "*factories*" "*__fixtures__*" 2>/dev/null | head -10` → fixture modification history
- `grep -ri "refresh\|update.*fixture\|update.*seed\|regenerat" scripts/ Makefile 2>/dev/null | head -5` → data-update scripts
- `find . -path "*/fixtures/*" -o -path "*/seeds/*" 2>/dev/null | grep -v node_modules | xargs ls -lt 2>/dev/null | head -10` → fixture modification dates
- `grep -ri "anonymi\|tonic\|delphix\|k.anonym" . --include="*.sh" --include="*.py" --include="*.js" 2>/dev/null | head -5` → anonymization pipeline

**Check:**
- Documented dataset-update process
- Update frequency (quarterly at minimum)
- Automated refresh pipeline with anonymization
- Bug-to-test workflow (prod bugs → new test cases)

**Levels:**
| Level | Criteria |
|-------|----------|
| 0 | No maintenance. Stale dataset. |
| 1 | Manual updates whenever someone thinks of it. |
| 2 | Documented update process. Quarterly. |
| 3 | Automated refresh pipeline. Anonymization. Representativeness validation. |
| 4 | Continuous data generation. Feedback loop with prod bugs. Coverage analysis. |

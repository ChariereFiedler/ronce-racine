# playground - installer sandbox

Disposable target repos to try `install.ts` by hand (interactive selector,
stack detection, lockfile, drift). `fixtures/` is **gitignored**.

## Generate the fixtures

```bash
npx tsx playground/setup.ts
```

Creates the git repos in `playground/fixtures/`. Each is declared in its own
module under `playground/fixtures-def/bases/`, and `setup.ts` only materialises
what it finds there: a task adding a fixture never edits the materialiser, and
two tasks adding two fixtures never collide on one file. Every fixture with an
`EXPECTED.md` ground truth (marked *gt*) keeps it out of git, so an evaluated
agent cannot read the answer key.

Two generations sit side by side. The **worlds** are the measurement base: real
repositories, tens of files and thirty-odd commits, built so that the answer
cannot be reached by reading everything. The **sandbox** fixtures predate them
and exist to try the installer by hand; they are far too small to measure a
skill, which is the finding that produced the worlds. See
[evaluating-skills.md](../docs/evaluating-skills.md), part 2, for the contract a
fixture meets before its manifests may claim a verdict, and
[fixtures.md](../docs/fixtures.md) for where their realism comes from.

### The worlds

| World | What it is | Who it serves |
|-------|------------|---------------|
| `incident` *(gt)* | a datasheet portal whose nightly job has been fixed six times in 29 days | the bug and detection family |
| `maturity` *(gt)* | a council intake service, genuinely uneven across domains | the `audit-*` family |
| `service` *(gt)* | a backend with one accessor that bypasses the tenant scope | DDD, modelling, schema, contracts |
| `surface` *(gt)* | a design system whose component is reached through a renaming barrel | the frontend family |
| `platform` *(gt)* | a pipeline whose stage barrier reads as an oversight | decisions, review, CI |
| `shopfront` *(gt)* | the taste skills' world, deliberately outside the measurement base | smoke only |

### The installer sandbox

| Fixture | Stack | What it exercises |
|---------|-------|-------------------|
| `frontend-vue` | Vue + Vitest | UI rules, frontend skills, `subscription-leak-scan` seed |
| `backend-node` | NestJS + SQL + migrations | clean-archi, DDD, no-raw-sql, migrations |
| `fullstack-ci` | React + Express + CI + Docker | broad palette (ops, agents) |
| `minimal-go` | bare Go | minimal proposal |
| `flawed-app` *(gt)* | Vue + planted defects | the detection scripts and the audit grids |
| `buggy-app` *(gt)* | Vitest + 3 prior `fix(cart)` commits | the bug family, recurring-fix detection |
| `shipped-feature` *(gt)* | Express + a happy-path unit test | validation and challenge skills |
| `mixed-vocabulary` *(gt)* | Express + SQL, three names for one concept | `domain-glossary` |
| `design-system` *(gt)* | Vue component with 4 call sites, one aliased | the shared-component family |
| `audit-target` *(gt)* | Express + Dockerfile, gaps per audit domain | the `audit-*` family |

## Try it

```bash
# read-only proposal
npx tsx install.ts plan playground/fixtures/frontend-vue

# interactive selector (real terminal required)
npx tsx install.ts install playground/fixtures/frontend-vue
#   ↑↓ move · space toggle · a (un)check the group · enter confirm · q cancel

# non-interactive
npx tsx install.ts install playground/fixtures/backend-node --yes      # default
npx tsx install.ts install playground/fixtures/fullstack-ci --all --yes # + optionals

# check the result
ls -R playground/fixtures/frontend-vue/.claude
cat   playground/fixtures/frontend-vue/.claude/.ronce-racine.json

# drift check (after an install)
npx tsx install.ts check playground/fixtures/frontend-vue
```

## Known-defect fixture (`flawed-app`)

`fixtures/flawed-app/` plants one defect per detector (secret, subscription
leak, TODO, console.log, hard wait, disabled test, swallowed error) and ships
its ground truth in `EXPECTED.md` (gitignored inside the fixture, so it never
reaches an evaluated agent). Use it to exercise the detection scripts
and the audit grids against expected findings:

```bash
npx tsx skills/detection-sweep/scripts/sweep.ts playground/fixtures/flawed-app
cd playground/fixtures/flawed-app && npx tsx ../../../scripts/subscription-leak-scan.ts
```

Any missed line = detector regression; any extra finding = false positive to
triage. Contract: every detector counts exactly 1.

## Reset

```bash
npx tsx playground/setup.ts   # recreates fixtures/ from scratch
```

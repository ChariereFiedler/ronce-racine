# playground — installer sandbox

Disposable target repos to try `install.ts` by hand (interactive selector,
stack detection, lockfile, drift). `fixtures/` is **gitignored**.

## Generate the fixtures

```bash
npx tsx playground/setup.ts
```

Creates four git repos in `playground/fixtures/`, each with a distinct stack:

| Fixture | Stack | What it exercises |
|---------|-------|-------------------|
| `frontend-vue` | Vue + Vitest | UI rules, frontend skills, `subscription-leak-scan` seed |
| `backend-node` | NestJS + SQL + migrations | clean-archi, DDD, no-raw-sql, migrations |
| `fullstack-ci` | React + Express + CI + Docker | broad palette (ops, agents) |
| `minimal-go` | bare Go | minimal proposal |

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

## Reset

```bash
npx tsx playground/setup.ts   # recreates fixtures/ from scratch
```

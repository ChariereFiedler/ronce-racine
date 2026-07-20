# Rule - `sql-migrations-discipline`

> Migrations are append-only history. Never rewrite an applied one, and never block production with a single destructive step.

| | |
|---|---|
| **Type** | Rule (path-scoped) |
| **Scope (`paths`)** | `**/migrations/**/*.sql`, `**/migrate/**/*.sql`, `**/db/migrate/**/*` |
| **Version** | 1.0.0 |
| **Artifact** | [`rules/sql-migrations-discipline.md`](../../rules/sql-migrations-discipline.md) |
| **Paired skill** | [`database-schema-evolution`](../../skills/database-schema-evolution/) |

## What it enforces

- **Never modify an already-applied migration**: most tools (SQLx, Flyway, Liquibase, Alembic, Knex…) store a checksum; editing breaks validation. Fix forward with a **new** migration.
- **Idempotence**: `IF NOT EXISTS` / `IF EXISTS` on DDL, conditional logic in a block (`DO $$ … $$` in PostgreSQL).
- **Table with production data → two-step (expand-contract)**: add *nullable* → backfill → add the constraint. Never a single blocking step.
- **Risky operations** (drop, rename, type change, `NOT NULL` on a populated table): route through expand-contract and a backward-compatible change.
- **Validate from a clean state**: replay all migrations on a fresh database before pushing, not just the last one.
- Regenerate compiled query artifacts (prepared queries, generated types) after any change touching queries.

## Why it matters

Migration tools trust their checksums to know what has run. Editing an applied migration desynchronizes every environment that already ran the old version - teammates and production diverge silently, and the tool refuses to proceed or, worse, skips the change. Forward-only migrations keep every environment on the same deterministic path.

The two-step / expand-contract discipline exists because a single destructive change on a live table can lock it, break the currently-deployed code, or fail halfway with no clean rollback. Adding a column as nullable, backfilling, then tightening the constraint keeps the old and new code both working during the deploy window - the essence of a zero-downtime schema change. Replaying from a clean database catches migrations that only "work" because of accumulated local state.

## How to apply it

### Idempotent DDL

```sql
CREATE TABLE IF NOT EXISTS invoices (id uuid PRIMARY KEY);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS status text;
```

### Expand-contract for a NOT NULL column on a populated table

```sql
-- Migration N: expand (nullable, non-blocking)
ALTER TABLE users ADD COLUMN country text;

-- App deploy backfills / starts writing country

-- Migration N+2: contract (now safe to constrain)
ALTER TABLE users ALTER COLUMN country SET NOT NULL;
```

### Validate from scratch before pushing

```bash
# Drop + recreate a throwaway DB, then replay every migration in order
```

## Related

- [`database-schema-evolution`](../../skills/database-schema-evolution/) plans and reviews schema changes end to end.
- Companion rule: [`no-raw-sql-interpolation`](no-raw-sql-interpolation.md) (safe queries against the evolved schema).

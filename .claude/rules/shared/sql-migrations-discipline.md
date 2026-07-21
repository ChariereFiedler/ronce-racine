---
paths:
  - "**/migrations/**/*.sql"
  - "**/migrate/**/*.sql"
  - "**/db/migrate/**/*"
version: 1.0.0
metadata:
  last-reviewed: 2026-06-19
---

# SQL migrations - discipline

- **Never modify an already-applied migration**: most tools (SQLx, Flyway, Liquibase, Alembic, Knex…) store a checksum; any change breaks validation. To fix, create a **new** migration (forward-only).
- **Idempotence**: `IF NOT EXISTS` / `IF EXISTS` on DDL, conditional logic in a block (`DO $$ … $$` in PostgreSQL, equivalent elsewhere).
- **Table with data in production → two-step migration** (expand-contract): add as *nullable* → backfill → add the constraint (`NOT NULL`, FK…). Never in a single blocking step.
- **Risky operations** (drop column/table, rename, type change, adding NOT NULL on a populated table): go through expand-contract and a backward-compatible change, not a direct breaking one.
- **Validate from a clean state** before pushing: replay all migrations on a fresh database, not just the last one.
- Regenerate compiled query artifacts (prepared queries, generated types) after any change touching queries.

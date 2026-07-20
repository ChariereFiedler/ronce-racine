---
name: database-schema-evolution
description: Use when renaming or reshaping tables/columns, when a schema migration is risky, when a schema change touches many usages across the code, or when a zero-downtime migration is required - "migrate this schema", "migre ce schéma", "rename this column", "renomme cette colonne", "zero-downtime migration".
version: 1.0.0
metadata:
  last-reviewed: 2026-06-19
  category: process
---

# Database Schema Evolution - evolve a schema with no breakage or downtime

> If the current repo has a project-specific migration skill (e.g. acme-app → `bulk-db-migration`), it wins - it knows the SQL engine, the migration tool, the commands and the project's CI gates.

## This skill vs. others

- **This skill** when: renaming/reshaping a table or column, a risky schema migration, a change touching several usages across the code, a zero-downtime constraint
- **`api-contract-versioning`** instead if: the change is about an exposed contract (API, events, public types), not the physical database schema
- **The repo's migration skill** if it exists: its conventions (engine, tool, CI lint) win over this generic protocol

## Principle

- **Exhaustive scan before any edit** - a forgotten schema usage breaks compilation, a query or the runtime down the line
- **Two-step expand-contract** - never a destructive change in a single migration; add the new, switch over, drop the old later
- **An applied migration is immutable** - fix it with a new migration, never by editing the existing one

## Context to gather (before acting)

- SQL engine and migration tool: read the config (`package.json` / `Cargo.toml` / `Makefile` / `migrations/` folder) - know how a migration is created and applied
- Read a neighboring migration and copy its conventions (naming, idempotence, format) before inventing
- Scope of usages: migrations/seeds, queries, types/DTOs mapped onto the schema, code generating or consuming those types, specs/contracts
- Is there data in production? (determines whether backfill and the two-step are mandatory)

## Protocol

```
- [ ] 1. Exhaustive scan of usages → impact plan
- [ ] 2. Expand: additive migration (new schema, nullable, idempotent)
- [ ] 3. Backfill / migrate the data to the new schema
- [ ] 4. Switch the code over to the new schema
- [ ] 5. Contract: separate migration dropping the old (after the switch is deployed)
- [ ] 6. End-to-end verification from a clean state
```

### 1. Exhaustive scan (mandatory before editing)

`grep -rn` the name to evolve across: migration and seed files, application code (queries), type definitions mapped onto the schema, frontend/client code consuming those types, specs/OpenAPI. Produce an **impact plan**:

| Area | Files | Nature of usage |
|---|---|---|
| migrations / seeds | N | DDL, data |
| data access | N | queries |
| types / DTOs | N | schema mapping |
| client / specs | N | consumed types |

### 2. Expand - additive migration

Create a **new** migration (never edit an applied one). It only adds:
- a new **nullable** column or a new table, never a blocking constraint up front;
- idempotence: `IF NOT EXISTS` / `IF EXISTS` on every DDL operation, a conditional block if the engine supports it;
- a rename = **add** the new name (view, duplicated column or alias), no brutal `RENAME` while code still reads the old one.

### 3. Backfill / migrate the data

Copy the old data into the new schema (in the migration if the volume is low, otherwise a dedicated idempotent and re-runnable job). No `DROP` or `NOT NULL` at this step.

### 4. Switch the code over

Update all usages from the impact plan to read/write the new schema. On a large scope, parallelize by area (see `superpowers:dispatching-parallel-agents`).

### 5. Contract - deferred removal

A **separate** migration, after the code switch is deployed and stable: add the constraints (`NOT NULL`), drop the old column/table. Never in the same migration as the expand: a code rollback must stay possible as long as the old schema exists.

### 6. End-to-end verification

Replay all migrations **from a clean state** (drop + recreate the local database), then compile/typecheck + tests touching the data, server side and client side.

## Traps & rationalizations

| Excuse | Reality |
|--------|---------|
| "I'll fix the already-applied migration, simpler" | Most tools verify a checksum: editing an applied migration breaks the history. Create a new migration |
| "Rename + drop in the same migration, save time" | No rollback possible and guaranteed downtime if code still reads the old name. Expand then contract, separated |
| "No need for a backfill, new rows are enough" | The old data becomes invisible/inconsistent. Backfill before any constraint |
| "`NOT NULL` straight on a table with data" | Immediate failure or a long lock. Add nullable → backfill → `NOT NULL` in a separate migration |
| "The scan is long, I'll just grep the queries" | A forgotten type, seed or spec breaks down the line. Exhaustive scan of every area |
| "Validated locally on my existing database" | An accumulated database masks a broken migration. Replay from a clean state |

## Exit condition

- [ ] Complete impact plan: zero schema usage outside the table
- [ ] Expand, backfill and contract in separate, idempotent migrations
- [ ] No existing migration modified
- [ ] Migrations replayed from a clean state (output pasted)
- [ ] Compile/typecheck + data tests green, server and client (real output, never "it should pass")
- [ ] Data preserved: no `DROP`/`NOT NULL` before backfill + switch

A missing box = do not apply in production.

## Tooling

- Adapt the scan's `grep -rn` to the current project's extensions and folders
- Migration tool and reset command specific to the project: read the config rather than assume

## Changelog

- 1.0.0 (2026-06-19) - initial version; provider-agnostic generalization of `bulk-db-migration` (acme-app) into a zero-downtime expand-contract protocol

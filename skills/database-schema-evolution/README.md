# `database-schema-evolution`

> Evolve a database schema with no breakage and no downtime: scan every usage first, then expand → backfill → switch → contract in separate, immutable migrations, verified from a clean state.

| | |
|---|---|
| **Type** | Skill (on-demand workflow) |
| **Category** | `process` |
| **Artifact** | [`SKILL.md`](SKILL.md) |
| **Tooling** | Project's own migration tool + `grep -rn` for the scan (engine-agnostic) |

## What it is

`database-schema-evolution` is a **zero-downtime migration protocol** for the risky schema changes — renaming or reshaping a table or column, anything that touches many usages across the code. It replaces the tempting single destructive migration with the classic **expand-contract** sequence, and it front-loads an exhaustive scan so no usage is missed.

It is engine- and tool-agnostic: it tells the agent to read the project's migration config and copy a neighboring migration's conventions rather than assume a specific database or framework.

## Why it exists

Schema changes fail in three predictable ways, and this skill defends against each:

- **A forgotten usage.** A rename that updates the queries but misses a type, a seed, or an OpenAPI spec breaks at compile time or at runtime, far from the edit. Defense: an **exhaustive scan** producing an impact plan before any edit.
- **A destructive one-shot.** `RENAME` + `DROP` in a single migration means no rollback and guaranteed downtime while old code still reads the old name. Defense: **expand then contract, in separate migrations**, so a code rollback stays possible.
- **A rewritten history.** Editing an already-applied migration breaks the checksum most tools verify. Defense: **an applied migration is immutable** — fix forward with a new one.

## When it triggers

- Renaming or reshaping tables/columns
- A risky schema migration
- A change touching many usages across the code
- A zero-downtime requirement

Route elsewhere when: the change is about an **exposed contract** (API, events, public types) rather than the physical schema (→ [`api-contract-versioning`](../api-contract-versioning/)); or the repo has its own migration skill whose engine/tool/CI conventions take precedence.

## How it works

The approach front-loads an exhaustive `grep -rn` scan into an impact plan, then applies the classic **expand-contract** sequence across separate, immutable migrations: add the new schema (additive, nullable, idempotent), backfill the data, switch the code over, and only later drop the old schema. The whole change is verified by replaying migrations from a clean database plus typecheck and data tests on both sides.

Full step-by-step protocol → [`SKILL.md`](SKILL.md).

## Worked example

> On `acme-app`, the column `users.name` must become `users.full_name` with zero downtime and production data present.

1. **Scan**: `grep -rn` finds `name` in 2 migrations, 5 queries, a `User` DTO, and the client types → impact plan built.
2. **Expand**: new migration adds a nullable `full_name` column, `IF NOT EXISTS`.
3. **Backfill**: `UPDATE users SET full_name = name WHERE full_name IS NULL`, re-runnable.
4. **Switch**: all reads/writes moved to `full_name` across the impact plan; deployed.
5. **Contract**: once stable, a separate migration sets `full_name NOT NULL` and drops `name`.
6. **Verify**: drop + recreate the local DB, replay all migrations, run typecheck and data tests green on both sides — output pasted.

## Related artifacts

- [`api-contract-versioning`](../api-contract-versioning/) — for changes to an exposed contract rather than the physical schema.

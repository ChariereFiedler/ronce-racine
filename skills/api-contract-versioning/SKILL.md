---
name: api-contract-versioning
description: Use when modifying an API endpoint, schema or contract consumed elsewhere - renaming/removing/restructuring a request or response field, pagination or envelope change, "field X must become", "le champ X doit devenir", introducing a breaking change, versioning an API, or deprecating a field/route. Covers REST, GraphQL and gRPC alike.
version: 1.0.0
metadata:
  last-reviewed: 2026-06-19
  category: feature
---

# Versioning a network API contract

> If the current repo has a specific skill or conventions for this case (e.g. acme-app → `api-contract-evolution`), they win — they know the project's paths, snapshots and stack.

## This skill vs. others

- **This skill** when: a **network** API contract (endpoint, schema, DTO, proto message) already consumed changes shape — REST, GraphQL or gRPC
- **refactoring-shared-component-api** instead if: it is the API of an **in-process** UI component or module (props/emits/exported signature), not a contract crossing the network
- New endpoint with no existing consumer: this is not a contract evolution, this skill does not apply

## Principle

A network API contract has a chain of consumers that are **coupled and potentially outside your deployment** (installed mobile clients, third-party partners, a distributed CLI). "The frontend compiles" proves nothing about them. The work is done when every consumer family is inventoried and then migrated or covered by a dated compatibility shim.

## Context to gather (before acting)

- Is the contract verified by an artifact (OpenAPI/GraphQL schema, `.proto`, contract snapshot)? If so, its diff IS the breaking-change review
- Which consumers **co-deploy** (monorepo, atomic pipeline) vs **outlive the deployment** (installed apps, third-party clients)? That boundary decides what is allowed to break
- Build / lint / test commands: read `package.json` / `Cargo.toml` / `Makefile` / CI

## Protocol

```
- [ ] 1. EXHAUSTIVE inventory of consumers (before any decision)
- [ ] 2. Classify each change: breaking vs additive
- [ ] 3. Prefer expand-contract (additive first)
- [ ] 4. Handle non-co-deployed consumers: compat or dated deprecation
- [ ] 5. Synchronize the whole chain in order
- [ ] 6. Verify end to end, contract diff reviewed and pasted
```

1. **Inventory** — grep the field/route name across **all** families: client mirror types, adapters/composables, test fixtures & mocks, contract schema/snapshot, distributed clients (CLI, SDK, installed apps), outbound integrations/webhooks to third parties. List each one: this is the migration checklist.
2. **Classify** — for each change, breaking (removal/rename/restructuring, tightened type, added required field) or additive (optional field added alongside). Explicit decision, never implicit.
3. **Expand-contract** — add the new alongside the old (expand), migrate the consumers, then remove the old (contract) in a second step. Avoids any moment of breakage.
4. **Non-co-deployed consumers** — a breaking change for them requires a compat shim (deserialization alias, temporary dual field, new API version/endpoint) **or** a verified tolerance, always with a **removal date tracked in a ticket** — never "we'll remove it later".
5. **Chain sync** (order) — contract source of truth (DTO/schema/proto) + persistence if a column → regenerate the contract artifact and **review the diff** → mirror types + client adapters → test fixtures & page objects → distributed clients. A DB schema migration is a change separate from the contract change.
6. **Verification** — build + lint + tests of the producer, then of the consumers, then contract comparison (compare mode, not `--update`), finally the touched end-to-end / E2E tests.

## Templates

- `templates/consumer-inventory.md` — table of consumer families + status (migrated / dated compat / not affected) to paste into the MR

## Traps & rationalizations

| Excuse | Reality |
|--------|---------|
| "The frontend compiles, we're good" | Covers neither the distributed CLI, nor installed apps, nor third-party partners, nor snapshots. The inventory is the authority. |
| "This field is only for display, I'll remove it" | A field with a mechanical role (polling id, pagination cursor) is preserved even if it looks useless to the UI. Read the usage before renaming. |
| "I regenerate the snapshot/schema and it's fixed" | Regenerating without reviewing the diff disables the contract guard by hiding it. The diff IS the review. |
| "We'll remove the old field later" | Without a tracked removal date, the compat becomes permanent. Dated ticket mandatory. |
| "Breaking accepted, everything co-deploys" | Verify: a single installed or third-party client outside the pipeline turns the breaking change into a silent prod break. |

## Exit condition

- [ ] Consumer-family inventory done (greps cited), each one listed
- [ ] Explicit breaking/additive decision per change; expand-contract applied when viable
- [ ] Non-co-deployed consumers: compat or deprecation with a dated removal ticket
- [ ] Contract-artifact diff (schema/snapshot) reviewed and pasted into the MR
- [ ] Chain synchronized; build + lint + tests of producer and consumers run, output pasted — never "it should pass"

## Tooling

- `templates/consumer-inventory.md` — consumer migration checklist

## Changelog

- 1.0.0 (2026-06-19) — initial release, generalized from the acme-app `api-contract-evolution` workflow (decoupled from a Rust/Axum stack, agnostic across REST/GraphQL/gRPC)

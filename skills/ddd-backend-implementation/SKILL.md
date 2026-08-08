---
name: ddd-backend-implementation
description: Use when implementing a backend feature in DDD layers, deciding where business logic / validation / I-O belongs during implementation, respecting the dependency direction toward the domain, or splitting commands from queries (CQRS). Use AFTER the model is designed, DURING implementation - "implement this backend feature", "implémente cette feature backend", "code these DDD layers", "implémente les couches DDD".
version: 1.0.1
metadata:
  last-reviewed: 2026-08-08
  category: feature
---

# DDD Backend Implementation - build a feature layer by layer

> If the current repo has a specific implementation skill, it wins - it knows the stack, the paths and the project commands.

## This skill vs. others

- **This skill** when: the model is settled and you write the code layer by layer (domain → application → infrastructure → handler)
- **`domain-modeling-design`** instead if: aggregates, invariants and placement are not decided yet (upstream of this skill - its output is this skill's input)
- **`superpowers:test-driven-development`** as a complement: this skill says *where* the code goes and in what order; TDD says *how* to write each layer (red test → green)

## Principle

The implementation respects two non-negotiable constraints: **the order of the layers** (from the core outward) and **the direction of dependencies** (everything points toward the domain, never the reverse). The domain knows nothing of the database, the network, or the web framework. Business logic lives in the aggregates; the outer layers only adapt (parse, persist, serialize). Short-circuiting the order or inverting a dependency produces an anemic model with logic scattered around.

## Context to gather (before acting)

- Framework + commands: read `package.json` / `Cargo.toml` / `pom.xml` / `Makefile` / CI config for fmt, lint, test, build
- Read **one already-implemented neighboring module** in the same context and copy its structure (layer split, naming, error handling, route wiring) before inventing anything
- The architecture in place: where domain / application / infrastructure / API live; how ports are declared and injected (DI, application state)
- The spec produced by the design phase (aggregates, invariants, commands/queries, ports, events) - if missing, go back to `domain-modeling-design`

## Protocol

Implement in this order, never the reverse, never a short-circuit. Test each layer before moving to the next.

1. **Domain** - aggregate + invariants
   - Value object for every constrained field, never a bare primitive; validate the constraint at construction
   - Invariants validated in the aggregate's **constructor / methods**, nowhere else
   - Methods = domain verbs (transitions, decisions), not getters/setters
   - The domain imports **nothing** from infrastructure or the framework. Pure domain tests, no I/O
2. **Application** - CQRS + ports
   - Separate **commands** (mutations) and **queries** (reads); a query does not mutate state
   - Define the **ports** (interfaces) here, on the application/domain side; not their implementation
   - A command handler orchestrates: load the aggregate, call its methods, persist through the port - no business rule here
   - Queries return read DTOs, not the domain aggregate
3. **Infrastructure** - adapters
   - Implement the ports declared in application (repos, network clients, queues)
   - This is the **only** layer that depends on the concrete technology (DB, ORM, queries). Parameterized queries, never string concatenation (injection)
   - Infrastructure depends on domain/application, never the reverse
4. **Handler / API** - the edge
   - The handler **parses input → calls the command/query → serializes output**. Nothing else
   - Authn/authz and multi-tenancy handled at the edge (extractor / middleware), not in the domain
   - Document the exposed contract (OpenAPI/IDL schema) if the project generates one
5. **Integration tests** - from the edge down to persistence, on the happy path + at least one invariant rejection

```
- [ ] Domain: aggregate + value objects + invariants, pure tests green
- [ ] Application: command/query + ports, handler with no business logic
- [ ] Infrastructure: port adapters, parameterized queries
- [ ] Handler: parse → CQRS → serialize, auth at the edge
- [ ] Dependency direction verified: everything points toward the domain
- [ ] Integration tests happy path + invariant rejection
- [ ] fmt / lint / typecheck / build of the scope green
```

## Templates

- No fixed template: copy the structure of a neighboring module in the project (local reference code beats a generic skeleton).

## Traps & rationalizations

| Excuse | Reality |
|--------|---------|
| "Just a small validation in the handler, it's faster" | Business logic outside the domain = an unguaranteed invariant, duplicated at the next caller. It lives in the aggregate. |
| "I put the rule in the repo/infra, I'm already there" | Infrastructure is a replaceable adapter; a rule living there disappears if the tech changes and is untestable without I/O. |
| "The domain just imports the DB client to go faster" | Domain → infra dependency: the core becomes untestable and coupled to the framework. The domain depends on nothing external. |
| "I create the structures, the logic will follow" | Anemic model: bags of getters/setters, logic scattered across services. The aggregate carries its rules. |
| "I code the handler first, I'll work up toward the domain" | The reverse order makes you follow the shape of the API or the tables, not the domain. Domain → application → infra → handler. |
| "Command and query are the same path, I'll share it" | Reads and writes have different constraints; merging them makes you mutate on a read path and complicates both. |

## Exit condition

- [ ] All 4 layers exist in order, each tested before the next
- [ ] No business logic outside the domain (neither handler nor infra)
- [ ] Dependency direction respected: domain independent of infra and framework
- [ ] Commands and queries separated; ports in application, implementations in infra
- [ ] Integration tests green: happy path + at least one invariant rejection
- [ ] fmt / lint / typecheck / build of the scope run, output pasted - never "it should pass"

## Tooling

- No generic script: the commands (fmt, lint, test, build) depend on the project, to be read from its manifest / CI config.

## Changelog

- 1.0.1 (2026-08-08) - dropped the fictional example projects from the precedence note

- 1.0.0 (2026-06-19) - initial generic version extracted from a project workflow, decoupled from any stack and any tracker

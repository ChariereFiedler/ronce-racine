---
name: domain-modeling-design
description: Use when modeling a new domain or aggregate before writing code, deciding where a piece of business logic belongs, defining invariants or bounded contexts, or asking "where does this logic go" / "how to design this domain" / "où mettre cette logique" / "comment concevoir ce domaine". Use BEFORE any implementation, not during it.
version: 1.0.0
metadata:
  last-reviewed: 2026-06-19
  category: feature
---

# Domain Modeling - design the model BEFORE the code

> If the current repo has a specific design skill, it wins - it knows its contexts, its stack and its placement conventions.

## This skill vs. others

- **This skill** when: designing the domain model (aggregates, bounded contexts, invariants, placement) **before** writing a single line; deciding where a business rule lives
- **`ddd-backend-implementation`** (neighboring skill) instead if: the model is settled and you implement it layer by layer (application/infrastructure)
- **`superpowers:brainstorming`** instead if: the product need itself is fuzzy (upstream of this skill)

## Principle

A good domain model is designed **before** the code, otherwise it gets inferred from the shape of the tables and the first layer written - and you inherit an anemic model. The output of this skill is a **spec** (aggregates, contexts, invariants, contracts, justified placement), not code. Until placement and invariants are decided, refuse to implement.

## Context to gather (before acting)

- Map the existing landscape: which bounded contexts / modules already exist, where neighboring concepts live
- Read an already-modeled neighboring aggregate and copy its conventions (naming, boundary, events) before inventing anything
- The domain's ubiquitous language: names of concepts as the business uses them, not technical terms
- The project's cross-cutting business rules that may apply to the new concept

## Protocol

1. **Identify the aggregates and their invariants**
   - Distinguish aggregate (consistency root + own lifecycle), entity (identity within an aggregate), value object (no own lifecycle, carried by the aggregate)
   - One transaction modifies **a single aggregate**: that is the consistency boundary. If a rule requires modifying two aggregates atomically, the boundary is misplaced
   - List the invariants the aggregate guarantees at all times (always true whatever the state)
2. **Delimit the bounded contexts**
   - The same word can name different concepts depending on the context - separate rather than force-unify
   - Define the relationships between contexts (who depends on whom, in which direction)
3. **Decide the placement** - in this order, document both the choice AND the rejection of the alternatives:
   - Extend an existing context if the concept is a continuation of it
   - New module in an existing context if CRUD/orchestration, few invariants
   - New bounded context **reserved for**: rich business invariants + own lifecycle + need for pure domain tests
   - Deciding criterion: "must the rule be testable without I/O (DB, network)?" → logic in the domain, isolated from infrastructure
4. **Define the contracts**
   - Commands/queries that evolve the aggregate; what they reject (invariant violation)
   - Ports (interfaces) on the domain/application side, implementations on the infrastructure side - the domain does not depend on infra
   - **A domain event for every silent decision** (deletion, skip, auto-resolution): without an event, no one can answer "why did nothing happen?"

```
- [ ] Aggregates / entities / VOs identified, consistency boundary justified
- [ ] Invariants listed (own + project cross-cutting)
- [ ] Bounded contexts delimited + relationships
- [ ] Placement decided, rejected alternatives documented
- [ ] Commands/queries + ports + events defined
```

## Traps & rationalizations

| Excuse | Reality |
|--------|---------|
| "I create the data structures, the logic will come after" | That's the anemic model: bags of getters/setters, business logic scattered across services. The aggregate must carry its rules. |
| "This validation rule, I'll put it in the controller / the application service" | Business logic outside the domain = an unguaranteed invariant, duplicated at the next call site. The rule lives in the aggregate. |
| "One big context is simpler" | Homonym concepts force-merged = coupling and an unreadable model. Separate the bounded contexts. |
| "We'll decide placement while implementing" | Placement decided under the pressure of the code follows the tables, not the domain. A blocking decision before the code. |
| "No need for an event, the deletion is obvious" | A silent decision is undebuggable in operations. Every notable side effect emits an event. |

## Exit condition

- [ ] Aggregates, entities, value objects identified; consistency boundary (1 transaction = 1 aggregate) justified
- [ ] Own + cross-cutting invariants enumerated and attached to their aggregate
- [ ] Bounded contexts delimited, relationships between contexts explicit
- [ ] Placement decided with rejected alternatives documented
- [ ] Commands/queries, ports and domain events defined
- [ ] Spec produced, NO implementation started

## Tooling

- No script: manual design. The output (domain spec) then feeds the layer-by-layer implementation skill.

## Changelog

- 1.0.0 (2026-06-19) - initial generic version extracted from a project workflow, decoupled from any stack and any tracker

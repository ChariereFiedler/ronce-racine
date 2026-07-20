# `ddd-backend-implementation`

> Build a backend feature layer by layer — domain first, edge last — so business logic stays in the aggregates and every dependency points inward.

| | |
|---|---|
| **Type** | Skill (on-demand workflow) |
| **Category** | `feature` |
| **Artifact** | [`SKILL.md`](SKILL.md) |
| **Tooling** | None (project-specific fmt/lint/test/build) |

## What it is

`ddd-backend-implementation` is the *implementation* half of a two-skill pair. Once a domain model has been designed (aggregates, invariants, bounded contexts, ports), this skill governs the act of turning that model into code without letting the model rot. It fixes the **order** the layers are written in and the **direction** their dependencies may point.

The output is working, tested code across four layers — domain, application, infrastructure, handler — plus integration tests that exercise the whole path.

## Why it exists

Anemic domain models are the default failure mode of backend work. They happen when code is written outward-in: someone starts from the HTTP handler or the database table, and the "domain" ends up as a bag of getters and setters while the real rules leak into controllers, services, and repositories. From there every invariant is unguaranteed and re-duplicated at each new caller.

This skill blocks that drift with two rules that are never negotiable:

1. **Layer order** — domain → application → infrastructure → handler, each tested before the next. You cannot follow the shape of the API or the tables if you build the core first.
2. **Dependency direction** — everything points toward the domain. The domain imports nothing from infrastructure or the framework, so it stays testable without I/O.

## When it triggers

Invoke it while implementing a backend feature, specifically when you are:

- writing the code for a feature whose model is already settled
- deciding where a piece of business logic, validation, or I/O belongs
- enforcing the dependency direction toward the domain
- splitting commands from queries (CQRS)

It runs **after** `domain-modeling-design` and **during** implementation — not before. If aggregates and placement are still open questions, go design them first.

## How it works

The code is built core-outward — domain, then application, then infrastructure, then handler — each layer tested before the next, with every dependency pointing inward toward the domain. Business rules live in the aggregates; the outer layers only adapt (parse, persist, serialize). Commands and queries stay split (CQRS), ports are declared in application and implemented in infrastructure, and integration tests exercise the whole path from the edge to persistence on both the happy path and an invariant rejection.

Full step-by-step protocol → [`SKILL.md`](SKILL.md).

### Gather context first

Before writing anything, read the project's manifest/CI for the fmt/lint/test/build commands, and read one already-implemented neighboring module — copy its layer split, naming, error handling and route wiring rather than inventing a fresh structure.

## Worked example

> You add a "cancel subscription" feature. The model (a `Subscription` aggregate with a `cancel()` transition and an invariant "cannot cancel an already-cancelled subscription") is already designed.

1. **Domain**: add `Subscription.cancel()` that flips state and rejects the double-cancel invariant in the method itself. Write pure unit tests: cancel a live subscription (ok), cancel a cancelled one (rejected). Green before moving on.
2. **Application**: add a `CancelSubscription` command and its handler — load the aggregate via the repo port, call `cancel()`, persist. No rule in the handler. Keep the read side (`GetSubscription` query returning a DTO) separate.
3. **Infrastructure**: implement the repo port against the DB with parameterized queries.
4. **Handler**: an endpoint that parses the subscription id, checks auth at the edge, calls the command, serializes the result.
5. **Integration test**: hit the endpoint on a live subscription (happy path) and on a cancelled one (invariant rejection surfaces as the right error).

Finally run fmt / lint / typecheck / build for the scope and paste the output.

## Related artifacts

- [`domain-modeling-design`](../domain-modeling-design/) — designs the model this skill implements; its spec is this skill's input.
- the Superpowers `test-driven-development` skill — complements this skill: it says how to write each layer (red → green) while this skill says where the code goes.

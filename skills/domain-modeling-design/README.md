# `domain-modeling-design`

> Design the domain model — aggregates, invariants, bounded contexts, placement — as a spec *before* any code, so the model follows the business and not the database tables.

| | |
|---|---|
| **Type** | Skill (on-demand workflow) |
| **Category** | `feature` |
| **Artifact** | [`SKILL.md`](SKILL.md) |
| **Tooling** | None (manual design; output is a spec) |

## What it is

`domain-modeling-design` is the *design* half of a two-skill pair. It runs before a single line of implementation code is written and produces a **spec**, not code: aggregates and their invariants, the bounded contexts and their relationships, a justified placement decision, and the command/query/port/event contracts. That spec becomes the input to `ddd-backend-implementation`.

## Why it exists

If you skip modeling and start coding, the model does not disappear — it gets inferred, badly. It gets read off the shape of the database tables and whatever the first layer written happens to need. The result is the anemic model: entities that are bags of getters and setters, with the real business rules scattered across controllers and services where no invariant is guaranteed.

Designing up front prevents that. The skill is deliberately **blocking**: until placement and invariants are decided, it refuses to implement. The cost of a wrong boundary is far higher once code depends on it.

## When it triggers

Invoke it when you are:

- modeling a new domain or aggregate before writing code
- deciding where a piece of business logic belongs
- defining invariants or bounded contexts
- asking "where does this logic go" / "how do I design this domain"

It runs **before** implementation, never during. If the model is already settled, go to `ddd-backend-implementation`. If the product need itself is still fuzzy, back up to `superpowers:brainstorming`.

## How it works

The design produces a spec, not code: identify the aggregates and the invariants they must always hold (one transaction = one aggregate marks the consistency boundary), delimit the bounded contexts and their dependency directions, decide placement by justifying both the choice and the rejected alternatives (the deciding question — must this rule be testable without I/O?), and define the command/query/port contracts plus a domain event for every silent decision. It stays deliberately blocking: no implementation until placement and invariants are settled.

Full step-by-step protocol → [`SKILL.md`](SKILL.md).

### Gather context first

Map the existing bounded contexts and modules, read a neighboring already-modeled aggregate and copy its conventions, learn the ubiquitous language (business names, not technical ones), and check which cross-cutting project rules apply to the new concept.

## Worked example

> The product team asks for "subscription pauses": a user can pause a subscription, and it auto-resumes after a set date.

1. **Aggregates/invariants**: `Subscription` is the aggregate (own lifecycle: active → paused → active/cancelled). Invariant: "a cancelled subscription cannot be paused"; "pause end date must be in the future". A `PausePeriod` is a value object carried by the aggregate.
2. **Contexts**: pausing lives in the existing Billing context — it is a continuation of subscription lifecycle, not a new domain. Note that "pause" in Billing is unrelated to a UI "pause" elsewhere; keep them separate.
3. **Placement**: extend the Billing context (rejected alternative: a new "Pauses" context — overkill, no independent lifecycle). Documented.
4. **Contracts**: `PauseSubscription` and `ResumeSubscription` commands (reject on the invariants above); a `SubscriptionAutoResumed` **domain event** so the silent auto-resume is debuggable in operations.

Output: the spec above, with no code written yet — ready for `ddd-backend-implementation`.

## Related artifacts

- [`ddd-backend-implementation`](../ddd-backend-implementation/) — implements the spec this skill produces, layer by layer.
- the Superpowers `brainstorming` skill — upstream, when the product need itself is still unclear.

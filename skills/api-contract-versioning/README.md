# `api-contract-versioning`

> Change a network API contract without breaking the consumers you can't redeploy - inventory every consumer, classify each change, and never remove the old shape before the new one has landed everywhere.

| | |
|---|---|
| **Type** | Skill (on-demand workflow) |
| **Category** | `feature` |
| **Artifact** | [`SKILL.md`](SKILL.md) |
| **Tooling** | [`templates/consumer-inventory.md`](templates/consumer-inventory.md) |

## What it is

`api-contract-versioning` is a discipline for **changing a contract that crosses the network** - a REST endpoint, a GraphQL schema, a gRPC `.proto` message, a serialized DTO - when something already consumes it. It forces a full inventory of consumers, an explicit breaking-vs-additive decision per change, and an ordered migration that never leaves the chain in a broken state.

## Why it exists

An in-process refactor is safe because the compiler sees every caller. A network contract is the opposite: its consumers are **coupled but out of sight**, and some of them outlive your deployment entirely - an installed mobile app, a third-party partner's integration, a CLI shipped to users' machines.

"The frontend compiles" is therefore a trap. It proves the one consumer that happens to live in your build is fine, and says nothing about the ones that will silently break in production the next time they call. This skill replaces that false signal with an explicit inventory, and replaces "we'll remove the old field later" with a dated removal ticket.

## When it triggers

Invoke it when an already-consumed contract changes shape:

- renaming, removing, or restructuring a request/response field
- a pagination or envelope change
- "field X must become …", introducing a breaking change
- versioning an API or deprecating a field/route

It covers REST, GraphQL, and gRPC alike. It does **not** apply to:

- an in-process UI component/module API (props, emits, exported signatures) → use `refactoring-shared-component-api`
- a brand-new endpoint with no existing consumer → nothing to version yet

## How it works

The approach is front-loaded on an exhaustive consumer inventory, because every later decision depends on it. From there you classify each change as breaking or additive, apply expand-contract so the old shape never disappears before the new one has landed, cover non-co-deployed consumers with a dated compat shim, then synchronize the chain in order and verify producer and consumers end to end with pasted output.

Full step-by-step protocol → [`SKILL.md`](SKILL.md).

### The contract diff is the review

When the contract is backed by an artifact (OpenAPI/GraphQL schema, `.proto`, snapshot), its diff *is* the breaking-change review. Regenerating the snapshot without reading the diff silently disables the very guard that would have caught the break - so the skill treats the diff as a mandatory, pasted review artifact.

## Worked example

> A `GET /orders` response returns `customer_name`. Product wants it split into `customer.first_name` / `customer.last_name`.

1. **Inventory** - grepping `customer_name` finds it in the web app's mirror types, an E2E fixture, the OpenAPI snapshot, and - critically - a shipped mobile client and a partner webhook payload. The last two do **not** co-deploy.
2. **Classify** - removing `customer_name` is breaking for the mobile client and the partner.
3. **Expand** - add `customer.first_name` / `customer.last_name` *alongside* the existing `customer_name`.
4. **Compat** - keep `customer_name` populated, open a dated removal ticket (`#412`, deadline once mobile adoption > 95%).
5. **Sync** - regenerate the OpenAPI snapshot, review and paste the diff, migrate the web app's mirror types and fixtures.
6. **Verify** - producer + consumer tests green, snapshot compared in compare mode, E2E green - outputs pasted into the MR via `templates/consumer-inventory.md`.

The old field is only removed in a later change, once the ticket's deadline condition is met.

## Related artifacts

- [`refactoring-shared-component-api`](../refactoring-shared-component-api/) - the in-process counterpart, for UI component/module APIs.
- [`recording-decisions`](../recording-decisions/) - record why a field with a mechanical role must be preserved.

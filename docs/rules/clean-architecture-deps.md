# Rule - `clean-architecture-deps`

> The business core knows nothing about I/O, frameworks, or databases. Dependencies always point inward, toward the domain.

| | |
|---|---|
| **Type** | Rule (path-scoped) |
| **Scope (`paths`)** | `**/*.ts`, `**/*.py`, `**/*.go`, `**/*.rs`, `**/*.php`, `**/*.java` |
| **Version** | 1.0.0 |
| **Artifact** | [`rules/clean-architecture-deps.md`](../../rules/clean-architecture-deps.md) |
| **Paired skills** | [`ddd-backend-implementation`](../../skills/ddd-backend-implementation/), [`domain-modeling-design`](../../skills/domain-modeling-design/) |

## What it enforces

The **dependency rule** of layered / hexagonal / clean architectures: source-code dependencies only ever point toward the business core. Concretely:

- The domain (entities, value objects, use cases) imports nothing technical - no HTTP client, no ORM, no framework type.
- Controllers, handlers, and routes stay thin: parse input, call a use case, serialize output. No business rule lives there.
- Interfaces (ports) are declared where they are **used** (application layer); their concrete implementations (adapters) live in infrastructure and depend inward.
- Invariants are validated at construction of the entity or value object, not scattered across callers.
- No layer is short-circuited (a handler never talks to the DB directly).

## Why it matters

When the domain depends on infrastructure, every technical decision leaks into the business logic: you cannot swap a database, test a use case without a live connection, or reason about a rule without loading a framework. Inverting the dependencies keeps the core **pure and testable**, isolates churn (frameworks change far more often than business rules), and makes the boundaries explicit so the codebase does not collapse into a big ball of mud.

Validating invariants at the data's construction point means an invalid entity simply cannot exist - every downstream layer can trust it, instead of re-checking or discovering corruption late.

## How to apply it

### Define the port where it is consumed

```ts
// application/ports/UserRepository.ts  (application layer owns the interface)
export interface UserRepository {
  findById(id: UserId): Promise<User | null>;
}

// infrastructure/PostgresUserRepository.ts  (adapter depends inward)
export class PostgresUserRepository implements UserRepository { /* ... */ }
```

### Keep the handler thin

```ts
// Bad - business logic in the route
app.post('/orders', (req, res) => {
  if (req.body.total > creditLimit) { /* rule leaked into the controller */ }
});

// Good - parse, delegate, serialize
app.post('/orders', async (req, res) => {
  const result = await placeOrder.execute(toCommand(req.body));
  res.json(toDto(result));
});
```

### Push invariants into the type

Prefer a constrained value object (`EmailAddress`, `PositiveQuantity`) over a bare `string`/`number`, and validate in its constructor so no invalid instance can be built.

## Related

- [`ddd-backend-implementation`](../../skills/ddd-backend-implementation/) applies this layering when building a backend feature.
- [`domain-modeling-design`](../../skills/domain-modeling-design/) drives the modeling of entities, value objects, and boundaries.
- Companion rule: [`error-handling-discipline`](error-handling-discipline.md) (errors cross boundaries as typed values).

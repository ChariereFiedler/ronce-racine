---
paths:
  - "**/*.ts"
  - "**/*.py"
  - "**/*.go"
  - "**/*.rs"
  - "**/*.php"
  - "**/*.java"
version: 1.0.0
metadata:
  last-reviewed: 2026-06-19
---

# Dependency direction

- **Dependencies point inward**: the business core (domain, entities) depends on no external technical detail (I/O, framework, DB, HTTP). Infrastructure depends on the domain, never the reverse.
- **No business logic in the controller / handler / route**: it parses the input, calls a use case, serializes the output. Business rules live in the domain/application layer.
- **Ports on the application side, adapters on the infrastructure side**: the interface (trait/interface) is defined where it is consumed; the concrete implementation (DB, third-party API) implements it from the outside.
- **Invariants closest to the data**: validate when constructing the entity / value object, not in the calling layer. Prefer a constrained type over a bare primitive for a constrained field.
- **No layer short-circuit**: a handler does not reach the database directly by skipping the application layer.

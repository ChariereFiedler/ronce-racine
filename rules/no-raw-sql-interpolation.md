---
paths:
  - "**/*.ts"
  - "**/*.js"
  - "**/*.py"
  - "**/*.go"
  - "**/*.rs"
  - "**/*.php"
  - "**/*.java"
version: 1.0.0
metadata:
  last-reviewed: 2026-06-19
---

# SQL - never string-interpolate

- **Never build a query by interpolating/concatenating** an input: no `format!`, template string, f-string, or `+` that injects a value into the SQL - an open door to injection.
- **Parameterized queries only**: bound placeholders (`$1`, `?`, `:name`) with the values passed separately, or a query builder / ORM that parameterizes for you.
- **Dynamic identifiers** (table/column names - not parameterizable): validate against an **explicit allowlist**, never interpolate raw input.
- Same principle for neighboring query languages (NoSQL, LDAP, shell commands): separate code from data, never stitch user input into the command.

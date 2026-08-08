---
# Limit injection to the relevant files (saves context).
# Drop the `paths` key (and only that key) for an always-on rule.
# `version` and `last-reviewed` are mandatory: `npm run rules:validate` fails without them.
paths:
  - "**/*.ext"
version: 1.0.0
metadata:
  last-reviewed: YYYY-MM-DD
---

# Short rule title

- First rule, imperative and verifiable.
- Second rule.

<!-- Details and examples belong in a linked doc, not in the rule. -->

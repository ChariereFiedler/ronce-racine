---
paths:
  - "**/*.rs"
  - "**/*.ts"
version: 1.0.0
metadata:
  last-reviewed: 2026-06-19
---

# Logging - sensitive data (GDPR)

- **Absolute rule**: never log an email, IP, token, hash, or secret in logs/traces (`warn!`, `error!`, `info!`, `console.log`, application logger…)
- Use non-personal identifiers (`user_id`, `org_id`, `*_id`) instead of the data itself
- Every new database field must be classified (Public / Internal / Confidential)

<!-- Concrete project identifiers, CI lint, and classification policy: to be detailed in a project rule + docs/security. -->

# Rule - `secure-logging`

> Logs are forever and widely read. Personal data and secrets never belong in them - log an identifier, not the thing itself.

| | |
|---|---|
| **Type** | Rule (path-scoped) |
| **Scope (`paths`)** | `**/*.rs`, `**/*.ts` |
| **Version** | 1.0.0 |
| **Artifact** | [`rules/secure-logging.md`](../../rules/secure-logging.md) |
| **Paired skills** | [`audit-security`](../../skills/audit-security/), [`audit-compliance`](../../skills/audit-compliance/) |

## What it enforces

- **Absolute rule**: never log an email, IP, token, hash, or secret in logs or traces (`warn!`, `error!`, `info!`, `console.log`, application logger…).
- Use **non-personal identifiers** (`user_id`, `org_id`, `*_id`) in place of the data itself.
- Every new database field must be **classified** (Public / Internal / Confidential).

## Why it matters

Logs flow to places production data never should: aggregation platforms, third-party observability vendors, developer laptops, long-lived archives, and support tooling. Anything written to a log is effectively distributed and retained beyond the app's own access controls. Logging an email or IP therefore turns an ordinary log line into a GDPR-relevant personal-data processing - and logging a token or secret hands an attacker with log access a live credential.

Referencing a stable `user_id` instead of the email gives you the same debuggability (you can still correlate, trace, and support) with none of the exposure. Classifying every new field at design time makes the "can this be logged?" question answerable by construction rather than discovered during an incident.

## How to apply it

### Log the identifier, not the data

```ts
// Bad - leaks PII / a live secret into the log sink
logger.info(`login for ${email} with token ${accessToken}`);

// Good - correlate by non-personal id
logger.info('login', { user_id: user.id });
```

```rust
// Bad
tracing::warn!("rate limit hit for {}", client_ip);
// Good
tracing::warn!(org_id = %org.id, "rate limit hit");
```

### Classify new fields

When adding a column, tag it Public / Internal / Confidential in the schema or data catalog, and let that classification decide whether it may ever appear in a log or trace.

> The rule intentionally leaves project-specific identifiers, the CI lint, and the full classification policy to a project-level rule and `docs/security`.

## Related

- [`audit-security`](../../skills/audit-security/) and [`audit-compliance`](../../skills/audit-compliance/) review logging exposure and data governance.
- Companion rule: [`error-handling-discipline`](error-handling-discipline.md) - enrich error context with ids, never with the sensitive payload.

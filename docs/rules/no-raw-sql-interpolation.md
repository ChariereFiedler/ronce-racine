# Rule — `no-raw-sql-interpolation`

> A query is code; a value is data. Never stitch the two together by hand — parameterize, always.

| | |
|---|---|
| **Type** | Rule (path-scoped) |
| **Scope (`paths`)** | `**/*.ts`, `**/*.js`, `**/*.py`, `**/*.go`, `**/*.rs`, `**/*.php`, `**/*.java` |
| **Version** | 1.0.0 |
| **Artifact** | [`rules/no-raw-sql-interpolation.md`](../../rules/no-raw-sql-interpolation.md) |
| **Paired skill** | [`audit-security`](../../skills/audit-security/) |

## What it enforces

- **Never build a query by interpolation/concatenation** of an input: no `format!`, template string, f-string, or `+` injecting a value into SQL.
- **Parameterized queries only**: bound placeholders (`$1`, `?`, `:name`) with values passed separately, or a query builder / ORM that parameterizes for you.
- **Dynamic identifiers** (table/column names, which cannot be parameterized): validate against an **explicit allowlist**, never interpolate raw input.
- Same principle for neighboring interpreters: NoSQL, LDAP, shell commands — separate code from data.

## Why it matters

String-interpolated SQL is the root cause of injection, still one of the most damaging and common vulnerabilities. When a value is concatenated into query text, a crafted input like `'; DROP TABLE users; --` is parsed as *code* rather than *data*. Parameterized queries close this entirely: the driver sends the query structure and the values over separate channels, so a value can never change the query's meaning — no amount of escaping cleverness is needed, and none can be forgotten.

Dynamic identifiers are the trap: placeholders bind values, not table or column names, so developers reach for interpolation there. An allowlist keeps that path safe — only known-good identifiers are ever spliced in, and arbitrary input is rejected outright.

## How to apply it

### Parameterize values

```ts
// Bad — injectable
db.query(`SELECT * FROM users WHERE email = '${email}'`);

// Good — bound placeholder, value sent separately
db.query('SELECT * FROM users WHERE email = $1', [email]);
```

```python
# Bad
cur.execute(f"SELECT * FROM users WHERE id = {user_id}")
# Good
cur.execute("SELECT * FROM users WHERE id = %s", (user_id,))
```

### Allowlist dynamic identifiers

```ts
const SORTABLE = new Set(['created_at', 'name', 'total']);
if (!SORTABLE.has(sortColumn)) throw new Error('invalid sort column');
db.query(`SELECT * FROM orders ORDER BY ${sortColumn}`); // safe: value came from the allowlist
```

## Related

- [`audit-security`](../../skills/audit-security/) reviews injection surfaces as part of a security audit.
- Companion rule: [`sql-migrations-discipline`](sql-migrations-discipline.md) (the other half of safe database work).
- Companion rule: [`secure-logging`](secure-logging.md) (don't log the injected value either).

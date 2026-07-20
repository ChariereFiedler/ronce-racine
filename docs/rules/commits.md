# Rule - `commits`

> Every commit message follows one conventional format, stays under 72 characters on the first line, and never mentions the tooling that wrote it.

| | |
|---|---|
| **Type** | Rule (always-on) |
| **Scope (`paths`)** | always active |
| **Version** | 1.0.0 |
| **Artifact** | [`rules/commits.md`](../../rules/commits.md) |
| **Paired skill** | [`commit-readiness-review`](../../skills/commit-readiness-review/) |

## What it enforces

A single, machine-parseable commit convention:

- **Format**: `type(scope): description (Closes #XX)`
- **Allowed types**: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`
- First line **≤ 72 characters**
- `(Closes #<iid>)` when the commit closes a ticket
- **Never** mention Claude, AI, or LLM in the message
- Ask for confirmation before `git commit`
- Split unrelated changes into separate logical commits

## Why it matters

Conventional commit messages are not cosmetic. A consistent `type(scope):` prefix lets tooling derive changelogs, compute semantic version bumps, and group history by area. The 72-character limit keeps `git log --oneline`, blame views, and hosting UIs readable without truncation. Linking `Closes #XX` wires the commit to its ticket so traceability is automatic.

Keeping tooling attribution out of the message keeps history about **what changed and why**, not about how it was produced - the authorship that matters is the engineering intent.

Asking before committing keeps a human in the loop for the one action that rewrites shared history.

## How to apply it

### Check the local convention first

```bash
git log --oneline -5
```

Recent history is the source of truth for scope naming; match it before writing a new message.

### Well-formed examples

```
feat(auth): add refresh-token rotation (Closes #142)
fix(parser): handle empty payload without throwing
refactor(orders): extract pricing into a use case
docs(readme): document the install flow
```

### Splitting unrelated work

If a diff touches an auth fix and a docs update, make two commits - even if that means running the pre-commit hooks twice. One concern per commit keeps `git revert` and `git bisect` surgical.

## Related

- [`commit-readiness-review`](../../skills/commit-readiness-review/) runs the pre-commit gate (secret scan, leftovers, message format) before the commit lands.
- Companion rule: [`pre-commit-secret-detection`](pre-commit-secret-detection.md) (never commit a credential).

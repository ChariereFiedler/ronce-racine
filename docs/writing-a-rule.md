# Writing a canonical rule

## Admission criterion: is it truly generic?

A rule belongs here **only** if it contains **no**:

- crate, package, module, or directory name of a specific project;
- specific script or file path (`scripts/...`, `validate.sh`, a template);
- business identifier (`invitation_id`, `connector_id`…) or CI gate name (`gate 8`, an ast-grep rule);
- reference to a stack imposed by a single project.

If the rule is useful but coupled, **split it**: the generic *principle* comes here, the *tooled how* stays in a project rule `rules/<project>/`.

> Example: "never log sensitive data" is generic → here. "the `validate.sh` lint blocks `email = %` and we use `invitation_id`" is project-specific → a project rule.

## Format

```markdown
---
paths:
  - "glob/of/files/**"
version: 1.0.0
metadata:
  last-reviewed: YYYY-MM-DD
---

# Short title

- Imperative, verifiable, concise bullets.
- No magic numbers, no fluff.
```

- **`paths:` frontmatter**: limits injection to the relevant files (saves context). Omitting it → always-active rule (reserve for cross-cutting rules like `commits.md`).
- **`version` (semver) + `metadata.last-reviewed`**: like skills (see [writing-a-skill.md](writing-a-skill.md)). Bump on every revision. Validated by `npm run rules:validate` (included in `npm test`).
- No `<!-- ... -->` provenance comment: the source of truth is this repo, no need to repeat it (and Claude Code strips them from context anyway).
- Keep it short: a long rule is followed less. Details and examples → a linked doc, not the rule.

Ready-to-copy skeleton: [`templates/rule.template.md`](templates/rule.template.md).

## After adding / modifying

1. Update the rules table in the [README](../README.md).
2. Re-sync the repos that adopt the rule (`npx ronce-racine install <repo> --rules-only`), or let their CI gate report the drift.

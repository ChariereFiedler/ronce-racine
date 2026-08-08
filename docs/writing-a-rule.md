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

- **`paths:` frontmatter**: limits injection to the relevant files (saves context). Omitting **that key** → always-active rule (reserve for cross-cutting rules like `commits.md`); the frontmatter block itself stays, since the two fields below are mandatory.
- **`version` (semver) + `metadata.last-reviewed`**: like skills (see [writing-a-skill.md](writing-a-skill.md)). Bump on every revision. Validated by `npm run rules:validate` (included in `npm test`).
- No `<!-- ... -->` provenance comment: the source of truth is this repo, no need to repeat it (and Claude Code strips them from context anyway).
- Keep it short: a long rule is followed less. Details and examples → a linked doc, not the rule.

Ready-to-copy skeleton: [`templates/rule.template.md`](templates/rule.template.md).

## The mandatory `docs/rules/<name>.md` page

A rule is a single file, so its human page lives under `docs/rules/` rather than next to it (see [developing.md](developing.md#what-travels-and-what-does-not)). `npm run rules:validate` **fails** without it, and checks two things beyond its existence:

- a `| **Version** | x.y.z |` cell holding the same version as the rule's frontmatter;
- a link back to the canonical artifact (`rules/<name>.md`).

The reverse also fails: a page under `docs/rules/` whose rule no longer exists. Copy an existing page for the shape - a one-line summary, a table of metadata, "What it enforces", "Why it matters", and where useful a short "How to apply it" with code.

## After adding / modifying

1. Add the rule to the `CATALOG` in [`src/catalog.ts`](../src/catalog.ts) with the signal that should propose it (`code`, `git`, `frontend`, `backend`, `sql`, `migrations`…). `tests/installer.test.ts` fails on a rule that exists on disk but no command can install.
2. Update the rules table in the [README](../README.md).
3. Re-sync the repos that adopt the rule (`npx ronce-racine install <repo> --rules-only`), or let their CI gate report the drift.

---
version: 1.0.0
metadata:
  last-reviewed: 2026-06-19
---

# Commit messages

- Format: `type(scope): description (Closes #XX)`
- Allowed types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`
- **Never** mention Claude, AI, or LLM in a commit message
- First line ≤ 72 characters
- Include `(Closes #<iid>)` when the commit closes a ticket
- Always ask for confirmation before `git commit`
- Check the format of recent commits (`git log --oneline -5`) before committing
- Separate logical commits for unrelated changes, even if the pre-commit hooks have to run again

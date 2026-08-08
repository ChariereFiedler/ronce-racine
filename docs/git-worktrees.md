# Git worktrees - multi-agent isolation patterns

Generic reference for making several agents (or features) work in parallel without collision, via `git worktree`. Nothing here is specific to Ronce Racine, and none of it is installed by the CLI: it is a working method, kept next to the contributor docs because this repository is routinely worked on by several agents at once.

## Contents

- When to use a worktree
- Symlinking heavy directories
- Conventions
- Caps (budgets)
- Session checklists
- Pitfalls

## When to use a worktree

One worktree = one branch = one isolated directory. Useful as soon as two independent bodies of work must not share the working tree (parallel agents, a long-running feature isolated from a hotfix). A single task at a time on a simple repo does not justify it.

```bash
git worktree add ../repo-wt-<id> -b feat/<id>-<slug>   # creates branch + worktree
git worktree list                                       # worktree status
git worktree remove ../repo-wt-<id>                     # cleanup after merge
```

## Symlinking heavy directories

Reinstalling dependencies per worktree costs time and space. Symlink the heavy, regenerable directories to the main repo:

| Typical directory | Why symlink it |
|-----------------|-----------------------|
| `node_modules/` | avoids an `install` (often ~1 GB) per worktree |
| framework build caches (`.next`, `.nuxt`, `.turbo`…) | avoids regeneration |
| native build directory (`target/`, `build/`…) | avoids recompilation (can be huge) |

→ Never rerun dependency installation in a symlinked worktree. Build tools that place a lock (Cargo, etc.) serialize parallel builds automatically.

## Conventions

| Element | Suggested format |
|---------|----------------|
| Feature branch | `feat/{id}-<slug>` |
| Bugfix branch | `fix/{id}-<slug>` |
| Worktree path | `../<repo>-wt-{id}` (outside the main tree) |
| Resume | `git pull --rebase origin <base>` |

Adapt `{id}` to the project's tracker (ticket number, issue…).

## Caps (budgets)

Beyond a certain number of worktrees / branches in flight, the cognitive cost and conflicts explode. Set an explicit cap (e.g. ~6 worktrees, ~5 branches in review at once) and enforce it with a `git worktree list` at the start of a session. No hook in this repository enforces a cap; the only worktree-aware one, `worktree-env-setup.ts`, symlinks a missing `.env` into a linked worktree. A cap reached = finish/merge before opening a new front.

## Session checklists

**Start**: list the existing worktrees → create/join the one for the current work → work **in that worktree only**.

**End**: `git status` + check for unpushed commits (`git log origin/<branch>..HEAD`) → after merge, remove the worktree → never manually delete a worktree before the merge.

## Pitfalls

- **Working in the wrong worktree**: always check the `pwd`/branch before editing.
- **Coupling between tickets**: two worktrees touching the same files → merge conflicts. Detect the overlap before parallelizing; serialize if coupled.
- **Deleting a dirty/unpushed worktree**: loss of work. Check the state before `remove`.
- **`install` in a symlinked worktree**: breaks the shared symlink. Forbidden.

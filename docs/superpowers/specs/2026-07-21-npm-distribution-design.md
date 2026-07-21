# npm distribution - design

Date: 2026-07-21 · Status: approved (brainstorm 2026-07-21)

## Problem

Adopting the toolkit today requires cloning the canonical repository and
running the installer from that clone. That is a real friction: the user must
find the repo, clone it somewhere durable, remember where, and `git pull` by
hand to update. The clone is also the drift reference, so the anti-drift CI job
has to re-clone at a pinned SHA on every run.

Meanwhile the target repo needs `tsx` at run time - a Node dependency imposed
on projects that may have no Node toolchain at all.

That second problem is already solved: hooks now ship pre-built
(`dist/hooks/*.js`, see the 0.4.0 work), so a target needs only Node. The same
build step makes the first problem solvable.

## Goal

`npx ronce-racine install .` as the single documented adoption path, with no
clone, and a drift reference that a human can read.

## Decisions (settled during brainstorm)

| Decision | Choice |
|---|---|
| Distribution | npm only. The clone stays available for CONTRIBUTORS, and is no longer a documented installation path. |
| Traceability | Package version **plus a content hash** of the installed canonical set. |
| Tarball contents | Distributable artifacts plus the human docs (~1.5 MB). |
| Publishing | Never automatic. Claiming the name is effectively permanent, so it takes an explicit human go. |

Why the content hash rather than the version alone: with a version string only,
`check` compares "0.4.0" against "0.4.0" and reports no staleness even when the
canonical content differs (a republished tarball, a poisoned cache, a local
`npm link` shadowing the real package). The hash is what makes staleness
detection mean anything once the git SHA is gone.

Rejected: supporting clone and package as equal installation paths. It doubles
the cases the lockfile, the CI template and the tests must handle, for a
convenience the contributor path already covers.

## What ships

`tools/build.ts` (extending `build-hooks.ts`) produces:

```
dist/install.js      the CLI, shebang #!/usr/bin/env node
dist/hooks/*.js      the hooks (already built as of 0.4.0)
```

`package.json`:

- `files`: `dist/`, `rules/`, `skills/`, `agents/`, `scripts/`, `templates/`, `docs/`
- excluded: `tests/`, `playground/`, `tools/`, every `*.test.ts` and `eval.yaml`
  (the installer already refuses to distribute the last two)
- `bin`: `{ "ronce-racine": "dist/install.js" }`
- `private: true` removed; `prepublishOnly` runs the build so a publish can
  never ship a stale `dist/`

## Lockfile

```jsonc
{
  "source": {
    "package": "ronce-racine",
    "version": "0.4.0",
    "contentHash": "sha256-a1b2…"   // sorted file list + contents of the installed canonical set
  },
  "installed": ["rule:commits.md", "skill:detection-sweep", …],
  "detached": []
}
```

`check` recomputes the hash from the package it is running from. A different
version OR a different hash reports `stale`. Per-artifact drift comparison is
unchanged: file-by-file against the canonical source.

Backward compatibility: existing lockfiles carry `source` as a plain SHA
string. `check` must read both shapes and treat the old one as "installed from
a clone", reporting staleness only on the artifact comparison.

## Consumer experience

| Today | After |
|---|---|
| `git clone` then `npx tsx install.ts install .` | `npx ronce-racine install .` |
| CI clones the canonical repo at the lockfile SHA | `npx ronce-racine@0.4.0 check . --strict` |
| Target repo needs Node **and tsx** | Target repo needs **Node** |

`templates/anti-drift.gitlab-ci.yml` collapses from a pinned clone to two
lines.

## What stays clone-only

Contributing, and running `npm test`, `npm run test:mutation`,
`npm run eval:dry` and the real evaluations. `docs/developing.md` already
describes the contributor setup; it must state explicitly that the clone is no
longer an installation path.

## Out of scope

- Publishing automatically from CI. A release stays a deliberate human act.
- Supporting installation from a git URL (`npx github:…`): npm-only keeps one
  code path, and a contributor who needs an unpublished version uses `npm link`.

## Risks

- **Name squatting is permanent.** `ronce-racine` is currently free on npm
  (verified 2026-07-21, registry returns 404). Publishing claims it for good.
- **A broken `dist/` ships silently** if `prepublishOnly` is bypassed. The
  release checklist must include `npm pack --dry-run` and an install of the
  packed tarball into a throwaway repo.
- **`npm link` during development** shadows the published package and would
  make `check` report staleness against a local build. Expected, but worth a
  line in the docs.

# Rules, hooks, agents and scripts

The [README](../README.md) tells the story. This page lists what ships and what
each piece prevents. Skills have their own page: [`catalog.md`](catalog.md).

## Rules: the constraints that are always on

Rules are injected automatically based on the files in play, so they cost you
nothing to remember. Each one exists because forgetting it produced a real
defect.

| Rule | Applies to | What it prevents |
|---|---|---|
| `commits.md` | always | commit messages that nobody can scan six months later |
| `pre-commit-secret-detection.md` | always | a key or token reaching a commit, where a revert no longer saves you |
| `minimal-code.md` | code (rs/ts/tsx/vue/py/go) | speculative code, and its opposite: unreadable one-liners written to save a line |
| `error-handling-discipline.md` | code (ts/js/vue/py/go/rs/php/java) | swallowed errors, and a `panic`/`unwrap` on a fallible path |
| `doc-code-parity.md` | `README.md`, `docs/**` | a documented command that no longer matches the code, which the reader trusts anyway |
| `clean-architecture-deps.md` | code (ts/py/go/rs/php/java) | business logic leaking into handlers, dependencies pointing away from the domain |
| `no-raw-sql-interpolation.md` | code (ts/js/py/go/rs/php/java) | a query built by string concatenation, which is an injection |
| `sql-migrations-discipline.md` | `**/migrations/**` | a migration edited after it shipped, or one that cannot be replayed |
| `secure-logging.md` | `*.rs`, `*.ts` | an email, IP or token in the logs, which is a GDPR problem |
| `subscription-cleanup.md` | frontend (ts/tsx/js/jsx/vue) | subscriptions, listeners and timers with no teardown, and the leaks they cause |
| `ui-states-complete.md` | components (tsx/jsx/vue/svelte) | a screen that handles the happy path and shows nothing while loading or failing |
| `test-discipline.md` | `*.spec.ts`, `*.test.ts` | tests that pass without ever having been seen to fail |
| `detection-gap-protocol.md` | `docs/postmortems/**` | treating a P0 found by a user as a bug rather than as a detection failure |

## Hooks: the small automatic behaviors

| Hook | Event | Why it is there |
|---|---|---|
| `skill-reminder.ts` | `UserPromptSubmit` | surfaces the skills matching your prompt, so a relevant one is not missed. Self-maintained, silent when nothing matches |
| `bash-npm-silent.ts` | `PreToolUse` / `Bash` | appends `--silent` to setup `npm install` / `npm ci`, which otherwise burn context on noise |
| `truncate-output.ts` (+ `truncate-bash-output.ts`) | `PreToolUse` / `Bash` | caps verbose command output past a threshold, always preserving it on error |
| `session-writer` + `session-inject` + `session-precompact` | `Stop` / `SessionStart(compact)` / `PreCompact` | a per-branch session memo: persists the context at session end and re-injects it after a compaction |
| `worktree-env-setup.ts` | `SessionStart` | symlinks the main repo's `.env` into the current worktree, so a worktree session is not born broken |
| `readme-freshness.ts` | `PreToolUse` / `Bash` | before a `git push`, has Claude re-read the README against the diff and report the claims it contradicts. Opt-in, warns without blocking |

Every hook fails open: it runs on every session of every repository that
installed it, so an error ends in a silent `exit 0` rather than blocking you.
The two to scrutinize before installing (`worktree-env-setup` symlinks your
`.env`, the session-memo trio writes to disk) are documented in
[`SECURITY.md`](../SECURITY.md). Where the [ronce mod](the-ronce-mod.md) runs,
it does the job of most of these hooks; unwire them there.

## Agents and scripts

- `code-reviewer`: architecture, reliability and correctness review of a diff.
  Read-only, and it ends on an actionable verdict.
- `qa-tester`: runs and writes E2E tests, favoring stable locators over timing
  hacks.
- `subscription-leak-scan.ts`: scans a staged frontend diff for subscriptions,
  listeners and timers with no teardown.

A project-specific agent or skill, coupled to your stack and your tracker, takes
precedence over its generic version here. Every generic skill says so up front.

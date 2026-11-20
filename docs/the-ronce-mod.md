# The ronce mod

`mods/ronce/` is a Claude Code mod: one in-process plugin of function hooks,
meant to take over from a stack of command hooks. It checks every tool call
against a per-project policy, shapes long outputs, runs quality checks after
edits, and writes one JSONL telemetry file per turn under
`~/.claude/ronce/events/`. The current version is 0.7.

Installed at the user scope, it runs in every project. A project without a
policy gets the engine's default rules; `"telemetry": null` in its policy turns
the event files off. A project's own rules live in its `.claude/ronce.json`, in
a reviewed diff like any other code.

The [README](../README.md) says what the mod is for. This page is the
reference.

## Install

From GitHub, which is what most people want:

```bash
claude plugin marketplace add ChariereFiedler/ronce-racine
claude plugin install ronce@ronce-racine
```

From a local clone, to run a version that is not released yet:

```bash
claude plugin marketplace add /path/to/ronce-racine
claude plugin install ronce@ronce-racine
```

A marketplace added from a local path is read from that folder
(`claude plugin list` shows it as `Read from`), so `claude plugin update` has
nothing to do there: after pulling a new version, restart `claude`. A mod is
loaded when the process starts, and `/clear` does not reload it. A marketplace
added from GitHub works the other way: the plugin is a copy pinned to a commit
under `~/.claude/plugins/cache/`, and `claude plugin update ronce@ronce-racine`
is what moves it.

### The rules are not in the mod

The mod acts on tool calls; it ships no rule files. The 13 always-on rules are
Markdown context and still come from the CLI (`install <repo> --rules-only`),
or from a symlink of `rules/` to `~/.claude/rules/shared` for personal use. See
[`distribution-model.md`](distribution-model.md).

### If the repository already installed the hooks

The mod does the job of the `truncate-output`, `bash-npm-silent` and
`shell-read-guard` hooks, and of the session hooks (`session-writer`,
`worktree-env-setup`, `skill-reminder`). Running both means every call is
handled twice. To move an adopted repository over, give the rules to the CLI
and the hooks to the mod:

```bash
npx ronce-racine uninstall <repo>
npx ronce-racine install <repo> --rules-only
```

`uninstall` removes only what the lockfile recorded and unwires its own hooks
from `settings.json`; `--rules-only` puts back the rules and the lockfile.

## A policy

A minimal `.claude/ronce.json` that holds the project to a ticket form and
tunes two of the session signals:

```json
{
  "version": 1,
  "ticket": {
    "skill": "write-issue",
    "headings": ["## Problem", "## Evidence", ["## Reproduction", "## Current behaviour"], "## Acceptance criteria"],
    "labels": ["bug", "enhancement"]
  },
  "contextSignal": { "thresholds": [50, 75] },
  "fixRepeat": { "mode": "enforce" }
}
```

Check that it loads the way the mod loads it:

```bash
npx tsx tools/ronce-policy.ts <repo>/.claude/ronce.json   # rules, patterns, examples
```

## What it enforces by default

The unambiguous guards: shell reads of project files, files created through a
heredoc, a destructive git command chained after `;`, Claude, AI or LLM in a
commit message, and a `cd` to the current directory (stripped). It also shapes
long successful outputs, keeping the whole of them under
`~/.claude/ronce/outputs/`. Every other rule starts in `shadow` mode, where it
records what it would have done and changes nothing; a project's policy
switches each rule with `"modes": { "<id>": "enforce" }`.

## What each key of the policy does

| Key | What it does | Default |
|---|---|---|
| `worktree` | Links the main checkout's `.env` (or the files listed) into a linked worktree | on |
| `memo` | After a compaction, appends the branch, the ticket, the last request and a stale decisions file | on |
| `band` | A line above the prompt: project, branch, context, cost, budgets | on |
| `freshness` | Fetches the base branch at session start and warns when the local copy lags | off |
| `agentBudget` | Refuses a dev subagent past the open merge request or worktree cap; agent types that only read are exempt | off |
| `skillHints` | Adds a skill suggestion to a prompt that matches a pattern | none |
| `skillCatalog` | Otherwise, names the skills whose quoted triggers or name words the prompt holds, from the project's `.claude/skills` and the `ronce-racine` plugin's catalog; this is the `skill-reminder` hook | on, 3 at most |
| `checks.onEdit` | After an edit, runs the checks whose `match` fits the file and hands any finding to the model | rustfmt, ESLint, Biome on `scripts/`, ast-grep |
| `checks.background` | After a turn, runs the checks of the changed files in the background, once per state of those files; a finding wakes the session (at most `maxWakes` times in a row) | `vitest related` |
| `ticket` | The project's ticket form (skill, headings, labels): an issue created without it is refused, and a prompt about a ticket names the skill. See [`ticket-form.md`](ticket-form.md) | none: a reminder only |
| `contextSignal` | Once per threshold, tells the model the context passed it (`thresholds`, percent of the window) and to write the state down before starting a fresh session. A threshold fires again when a compaction brought the context below it | on, `[40, 60, 75]` |
| `fixRepeat` | On a `fix(...)` commit, counts the fixes of the last `windowHours` hours that name the same ticket or scope; at `limit` (this one included) it points to the `recurring-bug-root-cause` skill. `mode` is `shadow` (counted in `/ronce-hits` only) or `enforce` | on, shadow, 3 in 48 h |
| rules `fix-needs-ticket`, `sleep-poll` | A `fix(...)` commit given with `-m` and no `#<n>` or `T-<id>`; a `sleep` of 5 seconds or more used as a wait (use Monitor) | warn |

`contextSignal`, `fixRepeat` and the last row only inform or warn. They never
block.

The defaults come from the telemetry: 25 % of the window would have fired on
64 % of the turns, 40 % on 42 %, 60 % on 23 %.

## Checks

A check is a command with placeholders (`{file}`, `{rel}`, `{files}`, `{group}`),
a directory, a timeout and the rule that turns its output into a finding; it is
skipped where its tool or its configuration is missing. A check marked
`deferIfBusy` waits for the next turn while a heavy process (`busyPattern`)
runs, so two sessions on the same machine do not compile at once;
`onlyIfFilesContain` keeps a costly check for the changes it is about (a SQL
check for the files that hold a query).

## What it records

```bash
npx tsx tools/ronce-report.ts --since 2026-10-08   # calls, failures, shell reads, repetitions, $ per 1 000 calls
```

The report also prints the share of turns above 40 % and 60 % of the context,
the share of the cost held by the ten most expensive sessions, and the fix
commits without a ticket reference. In a session, `/ronce-hits` lists the rules
that fired, shadow ones included.

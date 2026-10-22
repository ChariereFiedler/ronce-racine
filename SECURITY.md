# Security

## What runs automatically when you adopt Ronce Racine

Ronce Racine distributes **hooks** and **detection scripts** that execute code on your machine. Adopting them is opt-in and wired explicitly into your `settings.json`, but once wired, the hooks run **automatically** on Claude Code lifecycle events. Know exactly what runs before you enable it.

All hooks and scripts are TypeScript, run via `tsx`. None are `.sh`. Every hook is written **fail-open**: an error must never break your session (it exits 0 and stays silent).

| Hook | Runs on | What it does | Side effects |
|------|---------|--------------|--------------|
| `skill-reminder.ts` | every `UserPromptSubmit` | reads your prompt, suggests relevant skills | reads prompt text; no writes |
| `bash-npm-silent.ts` | `PreToolUse` / `Bash` | adds `--silent` to setup `npm install`/`npm ci` | rewrites the command string only |
| `truncate-output.ts` | `PreToolUse` / `Bash` | truncates oversized command output | trims output; preserves output on error |
| `session-writer.ts` | `Stop` | persists a session memo | **writes** a memo file under the session dir |
| `session-inject.ts` | `SessionStart` (compact) | re-injects the memo after compaction | reads the memo file |
| `session-precompact.ts` | `PreCompact` | snapshots context before compaction | writes a memo file |
| `worktree-env-setup.ts` | `SessionStart` | **symlinks the main repo's `.env`** into the current git worktree | creates a symlink to your `.env` |
| `readme-freshness.ts` | `PreToolUse` / `Bash` | before a `git push`, spawns the `claude` CLI to re-read `README.md` against the diff | **outbound API call and its cost, once per push**; warns, never blocks; opt-in |

**Two hooks widen what runs without asking you.** Claude Code only applies a
hook's `updatedInput` when the hook answers `permissionDecision: "allow"`, so
every command `bash-npm-silent` and `truncate-output` rewrite is auto-approved
and skips the permission prompt: `npm install`, `npm ci` (which run
`postinstall` scripts), `cargo build/test/clippy`, `curl …`,
`docker build/logs`, `rustup …`, unbounded `git log`/`git diff`. Commands they
do not match are unaffected. The exact list and how to narrow it:
[`hooks/README.md`](hooks/README.md).

`readme-freshness` is the only hook that leaves your machine: it runs `claude -p`
(binary from `RONCE_CLAUDE_BIN`, default `claude`), so it needs that CLI on PATH
and bills a request per `git push`. `RONCE_README_CHECK=off` skips it.

The two to scrutinize before enabling:
- **`worktree-env-setup.ts`** symlinks your `.env` (which may contain secrets) into worktrees. Review it if your worktrees are shared or synced anywhere.
- **`session-writer.ts` / `session-precompact.ts`** write your session context to disk. Review where, and whether that path is gitignored.

The **detection scripts** in `scripts/` and in some skills' `scripts/` are **read-only**: they scan the staged diff or the source tree and report; they do not modify files.

## Before you enable a hook

1. Read the hook's source - they are short, single-purpose `.ts` files in `hooks/`.
2. Install only the hooks you understand: the installer merges the wirings straight into `.claude/settings.json` (backing an existing file up to `settings.json.bak`), so deselect a hook in the interactive selector, or name what you want with `--pick hook:<file>.ts`.
3. Keep any file a hook writes (session memos) out of version control.

## Requirements

The wirings the installer writes use the hook exec form (`"command": "node"`
plus an `args` array) and `${CLAUDE_PROJECT_DIR}`, so they need **Claude Code
2.1.139 or later** (`args: string[]` (exec form) was added there, per the
[Claude Code changelog](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)).
Older versions also lack part of what these hooks rely on: the `PreCompact`
event, the `SessionStart` `compact` matcher, and `permissionDecision` /
`updatedInput` on `PreToolUse`. `readme-freshness` additionally needs the
`claude` CLI on PATH.

## Reporting a vulnerability

If you find a security issue in a hook, script, or the installer, please email **cedric@siliceum.com** rather than opening a public issue. You will get an acknowledgement and a fix timeline.

## No secrets in the repo

This repo must never contain a real secret. Contributions are expected to follow the `pre-commit-secret-detection` rule (gitleaks + grep fallback). A detected secret is treated as compromised: rotate it, do not just revert.

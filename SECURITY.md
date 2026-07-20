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

The two to scrutinize before enabling:
- **`worktree-env-setup.ts`** symlinks your `.env` (which may contain secrets) into worktrees. Review it if your worktrees are shared or synced anywhere.
- **`session-writer.ts` / `session-precompact.ts`** write your session context to disk. Review where, and whether that path is gitignored.

The **detection scripts** in `scripts/` and in some skills' `scripts/` are **read-only**: they scan the staged diff or the source tree and report; they do not modify files.

## Before you enable a hook

1. Read the hook's source - they are short, single-purpose `.ts` files in `hooks/`.
2. Wire only the hooks you understand into `settings.json` (the installer prints a per-hook snippet).
3. Keep any file a hook writes (session memos) out of version control.

## Reporting a vulnerability

If you find a security issue in a hook, script, or the installer, please email **cedric@siliceum.com** rather than opening a public issue. You will get an acknowledgement and a fix timeline.

## No secrets in the repo

This repo must never contain a real secret. Contributions are expected to follow the `pre-commit-secret-detection` rule (gitleaks + grep fallback). A detected secret is treated as compromised: rotate it, do not just revert.

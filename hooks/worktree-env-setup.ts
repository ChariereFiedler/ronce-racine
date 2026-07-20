#!/usr/bin/env node
/**
 * SessionStart hook — symlink .env in a linked worktree.
 *
 * If the session starts in a linked git worktree (not the main worktree),
 * and the main repo has a `.env` but the current worktree does not,
 * creates a `.env` → `<main-repo>/.env` symlink in the worktree.
 *
 * Behavior:
 *   - Absolutely fail-open: any error (no git, no worktree, no .env,
 *     symlink already present, insufficient permissions) → silent exit 0.
 *   - Idempotent: if the symlink already exists and points to the right place, do nothing.
 *   - Never overwrites an existing .env (file or symlink to another target).
 *
 * Event        : SessionStart
 * stdin input  : JSON { cwd?: string, ... } (read but not required)
 * Output       : nothing (silent exit 0)
 *
 * @version 1.0.0
 * @last-reviewed 2026-06-25
 */
import { readFileSync, existsSync, symlinkSync, lstatSync, readlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

/** Runs a git command and returns trimmed stdout, or '' on failure. */
function git(args: string[], cwd: string): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf-8', timeout: 5000 })
  if (r.status !== 0 || r.error) return ''
  return r.stdout?.trim() ?? ''
}

/**
 * Determines whether `dir` is a linked git worktree (not the main worktree).
 * Method: in a linked worktree, `--git-dir` ≠ `--git-common-dir`.
 * In the main worktree, the two are identical (or `--git-common-dir` is the same directory).
 */
function estWorktreeLie(dir: string): boolean {
  const gitDir = git(['rev-parse', '--git-dir'], dir)
  const commonDir = git(['rev-parse', '--git-common-dir'], dir)
  if (!gitDir || !commonDir) return false
  // Resolve to an absolute path to compare unambiguously
  const absGitDir = resolve(dir, gitDir)
  const absCommonDir = resolve(dir, commonDir)
  return absGitDir !== absCommonDir
}

/**
 * Returns the current worktree's root via `git rev-parse --show-toplevel`.
 */
function racineWorktree(dir: string): string {
  return git(['rev-parse', '--show-toplevel'], dir)
}

/**
 * Returns the main repo's root from the git-common-dir.
 * A linked worktree's git-common-dir is `<main-repo>/.git`;
 * its parent is therefore the main repo's root.
 */
function racineRepoPrincipal(dir: string): string {
  const commonDir = git(['rev-parse', '--path-format=absolute', '--git-common-dir'], dir)
  if (!commonDir) return ''
  // commonDir points to the main repo's .git directory
  return resolve(commonDir, '..')
}

function main(): void {
  // Consume stdin (required by some Claude Code harnesses)
  try { readFileSync(0, 'utf-8') } catch { /* no stdin, not blocking */ }

  const cwd = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()

  // Exit silently if we are not in a linked worktree
  if (!estWorktreeLie(cwd)) return

  const racineWt = racineWorktree(cwd)
  const racineMain = racineRepoPrincipal(cwd)
  if (!racineWt || !racineMain) return

  const envMain = join(racineMain, '.env')
  const envWt = join(racineWt, '.env')

  // The main repo must have a .env
  if (!existsSync(envMain)) return

  // If a .env already exists in the worktree, do not overwrite it
  if (existsSync(envWt)) {
    // Special case: it is already a symlink to the right target → idempotent
    try {
      const stat = lstatSync(envWt)
      if (stat.isSymbolicLink() && resolve(racineWt, readlinkSync(envWt)) === envMain) return
    } catch { /* lstat fails → exit without overwriting */ }
    return
  }

  // Create the .env → <main-repo>/.env symlink
  try {
    symlinkSync(envMain, envWt)
  } catch { /* non-fatal — insufficient permissions or race condition */ }
}

// Only run main() if the file is launched directly (not imported).
const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href
if (isMain) main()

process.exit(0)

#!/usr/bin/env node
/**
 * SessionStart hook - symlink .env in a linked worktree.
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
 * @version 1.0.1
 * @last-reviewed 2026-07-20
 */
import { readFileSync, existsSync, symlinkSync, lstatSync, readlinkSync, unlinkSync } from 'node:fs'
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
function isLinkedWorktree(dir: string): boolean {
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
function worktreeRoot(dir: string): string {
  return git(['rev-parse', '--show-toplevel'], dir)
}

/**
 * Returns the main repo's root from the git-common-dir.
 * A linked worktree's git-common-dir is `<main-repo>/.git`;
 * its parent is therefore the main repo's root.
 */
function mainRepoRoot(dir: string): string {
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
  if (!isLinkedWorktree(cwd)) return

  const wtRoot = worktreeRoot(cwd)
  const mainRoot = mainRepoRoot(cwd)
  if (!wtRoot || !mainRoot) return

  const envMain = join(mainRoot, '.env')
  const envWt = join(wtRoot, '.env')

  // The main repo must have a .env
  if (!existsSync(envMain)) return

  // If a .env already exists in the worktree, do not overwrite it.
  // (lstat, not existsSync: existsSync follows symlinks and reports a BROKEN
  // symlink as absent - symlinkSync would then fail EEXIST and never repair it.)
  let entry: ReturnType<typeof lstatSync> | undefined
  try { entry = lstatSync(envWt) } catch { /* no entry: fall through and create */ }
  if (entry) {
    if (!entry.isSymbolicLink()) return // a real file: never touch it
    try {
      if (resolve(wtRoot, readlinkSync(envWt)) === envMain && existsSync(envWt)) return // already correct
    } catch { return /* unreadable link → exit without overwriting */ }
    if (existsSync(envWt)) return // valid symlink to another target: never touch it
    // Broken symlink: it holds no data - replace it with the correct link.
    try { unlinkSync(envWt) } catch { return }
  }

  // Create the .env → <main-repo>/.env symlink
  try {
    symlinkSync(envMain, envWt)
  } catch { /* non-fatal - insufficient permissions or race condition */ }
}

// Only run main() if the file is launched directly (not imported).
const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href
if (isMain) main()

process.exit(0)

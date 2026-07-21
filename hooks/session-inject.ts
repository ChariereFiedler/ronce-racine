#!/usr/bin/env node
/**
 * SessionStart hook - re-injects the session memo as additionalContext
 * after a context compaction.
 *
 * The memo is read from `~/.claude/projects/<repo-slug>/sessions/<branch>.md`
 * (written by session-writer). If no memo exists for the current branch,
 * silent exit 0.
 *
 * Event      : SessionStart
 * Matcher    : compact   (only activates after a compaction)
 * Input      : stdin JSON { session_id?: string, ... }
 * Output     : stdout JSON { hookSpecificOutput: { hookEventName, additionalContext } }  - or nothing if absent
 *
 * @version 1.0.0
 * @last-reviewed 2026-06-25
 */
import { readFileSync, existsSync } from 'node:fs'
import { sessionPathFor, currentBranch } from './session-writer.ts'

const REPO_ROOT = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()

function main(): void {
  // Drain stdin (unused but required so as not to block the pipe)
  try { readFileSync(0, 'utf-8') } catch { /* ignore */ }

  const branch = currentBranch(REPO_ROOT)
  const memoPath = sessionPathFor(REPO_ROOT, branch)

  if (!existsSync(memoPath)) {
    process.exit(0)
  }

  try {
    const content = readFileSync(memoPath, 'utf-8').trim()
    if (!content) { process.exit(0) }

    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: [
          '## Context from the previous session',
          '',
          content,
          '',
          '_This context was preserved automatically before the compaction._',
        ].join('\n'),
      },
    }))
  } catch { /* non-fatal - a hook must never break the session */ }

  process.exit(0)
}

main()

#!/usr/bin/env node
/**
 * PreCompact hook - persists a fresh session memo BEFORE a compaction, so the
 * SessionStart(compact) hook can re-inject up-to-date context afterwards.
 *
 * Note: PreCompact CANNOT influence the compaction summary itself (the event has
 * no mechanism to inject text into the summary prompt; `systemMessage` is only a
 * user-facing notice). So instead of trying to steer the summary, this hook
 * captures the current context to disk - the same memo file session-writer uses:
 * `~/.claude/projects/<repo-slug>/sessions/<branch>.md`.
 *
 * Event      : PreCompact
 * Matcher    : (none - applies to every compaction)
 * Input      : stdin JSON { transcript_path?: string, cwd?: string }
 * Output     : nothing (silent exit 0)
 *
 * @version 2.0.0
 * @last-reviewed 2026-07-10
 */
import { readFileSync } from 'node:fs'
import { persistMemo } from './session-writer.js'

const REPO_ROOT = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()

interface PreCompactEvent {
  transcript_path?: string
  cwd?: string
}

function main(): void {
  let event: PreCompactEvent = {}
  try {
    const raw = readFileSync(0, 'utf-8').trim()
    if (raw) event = JSON.parse(raw) as PreCompactEvent
  } catch { /* fail-open */ }

  const repoRoot = event.cwd ?? REPO_ROOT
  const now = new Date().toISOString().replace('T', ' ').slice(0, 16)
  persistMemo(repoRoot, event.transcript_path, now)

  process.exit(0)
}

main()

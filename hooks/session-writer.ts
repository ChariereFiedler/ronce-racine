#!/usr/bin/env node
/**
 * Stop hook — writes the session memo OUTSIDE the repo, to
 * `~/.claude/projects/<repo-slug>/sessions/<branch>.md`.
 *
 * The file is stored outside the repository to avoid polluting git status
 * and to stay relevant independently of the target project.
 *
 * Event      : Stop
 * Matcher    : (none — applies to every session end)
 * Input      : stdin JSON { transcript_path?: string, stop_hook_active?: boolean }
 * Output     : nothing (silent exit 0)
 *
 * @version 1.0.0
 * @last-reviewed 2026-06-25
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const REPO_ROOT = process.env.CLAUDE_PROJECT_DIR ?? process.cwd()

interface StopEvent {
  transcript_path?: string
  stop_hook_active?: boolean
  cwd?: string
}

interface ContentBlock {
  type: string
  text?: string
}

interface TranscriptEntry {
  type?: string
  message?: {
    role?: string
    content?: string | ContentBlock[]
  }
}

function readStdin(): string {
  try { return readFileSync(0, 'utf-8') } catch { return '' }
}

function parseTranscript(path: string): TranscriptEntry[] {
  try {
    return readFileSync(path, 'utf-8')
      .split('\n')
      .filter(l => l.trim())
      .map(l => { try { return JSON.parse(l) as TranscriptEntry } catch { return null } })
      .filter((e): e is TranscriptEntry => e !== null)
  } catch {
    return []
  }
}

/** Walks back through the transcript entries to find the last user message. */
function extractLastUserMessage(entries: TranscriptEntry[]): string | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i]
    if (entry.type !== 'user') continue
    const content = entry.message?.content
    if (typeof content === 'string' && content.trim()) return content.slice(0, 600)
    if (Array.isArray(content)) {
      const block = content.find(b => b.type === 'text' && b.text?.trim())
      if (block?.text) return block.text.slice(0, 600)
    }
  }
  return null
}

function git(args: string[], cwd: string): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf-8', timeout: 5000 })
  return r.stdout?.trim() ?? ''
}

/** Returns the repository's current branch (fallback: 'master'). */
export function currentBranch(repoRoot: string): string {
  return git(['rev-parse', '--abbrev-ref', 'HEAD'], repoRoot) || 'master'
}

/**
 * Slugifies an absolute path by replacing `/` with `-`, matching the
 * Claude Code convention for `~/.claude/projects/<slug>/`.
 */
export function repoSlug(absPath: string): string {
  return absPath.replace(/\//g, '-')
}

/**
 * Slugifies a branch name into a safe filename (`/` is problematic on
 * most filesystems).
 */
export function branchSlug(branch: string): string {
  return branch.replace(/[/\\]/g, '_').replace(/[^A-Za-z0-9._-]/g, '_')
}

/** Home directory, honoring $HOME (os.homedir() ignores it on POSIX). */
function home(): string {
  return process.env.HOME || homedir()
}

/** External sessions directory for a given repository. */
export function sessionsDir(repoRoot: string): string {
  return join(home(), '.claude', 'projects', repoSlug(repoRoot), 'sessions')
}

/** Full path of the session memo for a given branch. */
export function sessionPathFor(repoRoot: string, branch: string): string {
  return join(sessionsDir(repoRoot), `${branchSlug(branch)}.md`)
}

/** Builds the memo markdown. Pure and deterministic given `now`. */
export function buildMemo(branch: string, lastIntent: string | null, now: string): string {
  const lines: string[] = [
    `# Session — ${now}`,
    '',
    `**Branch:** \`${branch}\``,
  ]
  if (lastIntent) {
    lines.push('', '## Latest user intent', `> ${lastIntent.replace(/\n/g, '\n> ')}`)
  }
  lines.push('', '---', '_session memo (ronce-racine)_')
  return lines.join('\n')
}

/** Reads the transcript, builds the memo and writes it to disk. Fail-open. */
export function persistMemo(repoRoot: string, transcriptPath: string | undefined, now: string): void {
  try {
    const entries = transcriptPath ? parseTranscript(transcriptPath) : []
    const branch = currentBranch(repoRoot)
    const lastIntent = extractLastUserMessage(entries)
    mkdirSync(sessionsDir(repoRoot), { recursive: true })
    writeFileSync(sessionPathFor(repoRoot, branch), buildMemo(branch, lastIntent, now), 'utf-8')
  } catch { /* non-fatal — a hook must never break the session */ }
}

function main(): void {
  let event: StopEvent = {}
  try {
    const raw = readStdin().trim()
    if (raw) event = JSON.parse(raw) as StopEvent
  } catch { /* fail-open */ }

  // Resolve the repository root: prefer the event's cwd field, then env, then cwd()
  const repoRoot = event.cwd ?? REPO_ROOT
  const now = new Date().toISOString().replace('T', ' ').slice(0, 16)
  persistMemo(repoRoot, event.transcript_path, now)
  process.exit(0)
}

// Only run main() if the file is launched directly (not imported).
// Canonical ESM test: compare the module URL to the actual entry point.
// Works under tsx (process.argv[1] → .ts path) and with a compiled bundle.
const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href
if (isMain) main()

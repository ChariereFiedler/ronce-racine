#!/usr/bin/env node
/**
 * PreToolUse hook for Bash: before a `git push`, has Claude re-read README.md
 * against what the push actually changes, and reports the claims the change
 * contradicts.
 *
 * Why an LLM rather than a grep: the drift that matters is semantic. A README
 * saying "34 skills", "validated by npm test" or "hooks ship as TypeScript"
 * stays true-looking to any pattern you can write, and stops being true the
 * moment a number, a command or a mechanism changes. That is exactly the class
 * of defect the doc-code-parity rule targets, and the only reader able to spot
 * it is one that understands both texts.
 *
 * WARNS, never blocks, by design: this repo's own rule is that a hook fires on
 * every session of every repo that installed it, so it fails open - a flaky
 * gate gets disabled, which is worse than no gate. Set
 * RONCE_README_CHECK=block to make a contradiction deny the push instead.
 * Set RONCE_README_CHECK=off to skip it entirely.
 *
 * Scope, stated plainly: this sees pushes made by Claude. A human typing
 * `git push` in their own terminal does not go through it - use the CI job for
 * that guarantee.
 *
 * @version 1.0.0
 * @last-reviewed 2026-08-08
 */
import { readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

interface HookInput {
  tool_name?: string
  tool_input?: { command?: string }
  cwd?: string
}

/** Paths whose change can invalidate a README claim. Docs alone cannot. */
const STRUCTURAL = /^(install\.ts|package\.json|skills\/|rules\/|hooks\/|agents\/|scripts\/|templates\/|\.claude-plugin\/)/

const VERDICT_OK = 'README_OK'
const TIMEOUT_MS = 120_000
const MAX_DIFF_CHARS = 60_000

export function isGitPush(cmd: string): boolean {
  // A push hidden behind `&&` still pushes; a `--dry-run` does not.
  if (/--dry-run\b/.test(cmd)) return false
  return cmd.split(/&&|\|\||;/).some((part) => /^\s*git\s+(-\S+\s+)*push\b/.test(part))
}

/** Files the push would send, i.e. local commits the upstream does not have. */
export function changedFiles(cwd: string): string[] {
  const git = (args: string[]): string | null => {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 10_000 })
    return r.status === 0 ? (r.stdout ?? '').trim() : null
  }
  // `@{push}` is the tracking ref when configured; fall back to the remote HEAD,
  // and give up rather than guess when neither resolves (a first push, a repo
  // with no upstream) - a diff against nothing would flag the entire README.
  const base = git(['rev-parse', '--abbrev-ref', '@{push}']) ?? git(['rev-parse', '--abbrev-ref', 'origin/HEAD'])
  if (!base) return []
  const out = git(['diff', '--name-only', `${base}...HEAD`])
  return out ? out.split('\n').filter(Boolean) : []
}

export function buildPrompt(readme: string, files: string[], diff: string): string {
  return [
    'You are checking a README against changes about to be pushed.',
    '',
    'Report ONLY statements in the README that the changes make FALSE or misleading:',
    'a wrong count, a command that no longer exists or was renamed, a described',
    'mechanism that changed, a documented file that moved or disappeared.',
    '',
    'Do NOT report: style, tone, wording, missing sections, things you would',
    'phrase differently, or anything you cannot check against the diff below.',
    'Absence of documentation for a new thing is only worth reporting when the',
    'README already claims to list every one of them (a table of all skills, all',
    'hooks, all rules).',
    '',
    `If nothing in the README is contradicted, reply with exactly: ${VERDICT_OK}`,
    'Otherwise reply with one line per problem: `<README quote>` -> <what is now true>',
    '',
    '=== FILES IN THIS PUSH ===',
    files.join('\n'),
    '',
    '=== DIFF ===',
    diff.length > MAX_DIFF_CHARS ? `${diff.slice(0, MAX_DIFF_CHARS)}\n[diff truncated]` : diff,
    '',
    '=== README.md ===',
    readme,
  ].join('\n')
}

/** `claude -p --output-format json` wraps the text in {"result": "..."}. */
export function unwrapEnvelope(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { result?: unknown }
    if (typeof parsed.result === 'string') return parsed.result
  } catch {
    // Plain-text output, or a stub: use it as-is.
  }
  return raw
}

function emit(decision: 'allow' | 'deny', reason: string): void {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: decision,
      permissionDecisionReason: reason,
    },
  }))
}

function main(): void {
  const mode = process.env.RONCE_README_CHECK ?? 'warn'
  if (mode === 'off') return

  let parsed: HookInput
  try {
    parsed = JSON.parse(readFileSync(0, 'utf-8'))
  } catch {
    return // No input, or not JSON: nothing to decide on.
  }
  if (parsed.tool_name !== 'Bash') return
  const cmd = parsed.tool_input?.command ?? ''
  if (!cmd || !isGitPush(cmd)) return

  const cwd = parsed.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
  const readmePath = join(cwd, 'README.md')
  if (!existsSync(readmePath)) return

  const files = changedFiles(cwd)
  if (!files.some((f) => STRUCTURAL.test(f))) return // Nothing that can invalidate a claim.

  const bin = process.env.RONCE_CLAUDE_BIN ?? 'claude'
  const diff = spawnSync('git', ['diff', '--stat', '-p', '@{push}...HEAD'], {
    cwd, encoding: 'utf8', timeout: 15_000, maxBuffer: 32 * 1024 * 1024,
  })

  let readme: string
  try {
    readme = readFileSync(readmePath, 'utf-8')
  } catch {
    return
  }

  const run = spawnSync(bin, ['-p', buildPrompt(readme, files, diff.stdout ?? ''), '--output-format', 'json'], {
    cwd, encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024,
  })
  // Fail open on every failure mode: claude absent, not authenticated, timed
  // out, rate-limited. A push must never be held hostage by this check.
  if (run.error || run.status !== 0) return

  const verdict = unwrapEnvelope(run.stdout ?? '').trim()
  if (!verdict || verdict.includes(VERDICT_OK)) return

  const message = `README may be out of date with this push:\n${verdict}`
  if (mode === 'block') emit('deny', `${message}\n\nFix the README, or push with RONCE_README_CHECK=off.`)
  else emit('allow', message)
}

// Entry guard by BASENAME, never by extension: this file is authored as .ts and
// ships as .mjs, and an extension-bound guard silently disables main() in the
// built copy - the hook then exits 0 doing nothing, with no signal at all.
const invoked = (process.argv[1] ?? '').split('/').pop()?.replace(/\.(ts|mjs|js)$/, '')
if (invoked === 'readme-freshness') main()

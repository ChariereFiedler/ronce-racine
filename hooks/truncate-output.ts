#!/usr/bin/env node
/**
 * PreToolUse hook for Bash: wraps verbose commands (cargo build/test,
 * npm install, git log, curl…) so their output is truncated when it
 * exceeds a character threshold. Error output (exit ≠ 0) is always
 * preserved in full so as not to hide debugging information.
 *
 * Uses base64 encoding to pass the original command to the
 * truncate-bash-output.ts script, avoiding shell-escaping problems.
 *
 * Bypass strategy: if the command contains `# no-truncate`, we leave it untouched.
 *
 * @version 2.1.0
 * @last-reviewed 2026-08-24
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

interface HookInput {
  tool_name?: string
  tool_input?: { command?: string }
}

const VERBOSE_PATTERNS: RegExp[] = [
  /^\s*cargo\s+(build|test|clippy|check|fmt|doc|run)/,
  // `npm install`/`npm ci` are handled by the bash-npm-silent hook (avoid a
  // two-hook conflict on the same command - PreToolUse updatedInput is last-wins).
  /^\s*npm\s+run\s+(build|test|typecheck|lint)\b/,
  /^\s*npx\s+(vitest|tsc|nuxi|tsx)\b/,
  // git log/diff are only voluminous UNBOUNDED: `--oneline`, `-n`, `-<count>`
  // or a `--stat` summary stay short, and rewriting them costs readability for
  // nothing since the 4000-char threshold would never fire anyway.
  /^\s*git\s+(log|diff)\b(?!.*(--oneline|--stat|--name-only|--name-status|\s-\d+|\s-n\s))/,
  /^\s*curl\s/,
  /^\s*docker\s+(build|logs)\b/,
  /^\s*rustup\s/,
]

const SKIP_PATTERNS: RegExp[] = [
  /\|\s*(head|tail|grep|wc|less|more|awk|sed|cut|sort|uniq|jq)\b/,
  /# no-truncate/,
  /truncate-bash-output/,
]

export function isVerboseCommand(cmd: string): boolean {
  if (SKIP_PATTERNS.some(p => p.test(cmd))) return false
  const parts = cmd.split(/&&|\|\|/).map(s => s.trim())
  return parts.some(part => VERBOSE_PATTERNS.some(p => p.test(part)))
}

export function wrapCommand(cmd: string, hookDir: string): string {
  const encoded = Buffer.from(cmd).toString('base64')
  // The command travels base64-encoded so no shell quoting can break it, but an
  // opaque blob is hostile to anything downstream: other hooks observing the
  // same event, a human reading the transcript, a log. So the original is kept
  // in clear as a TRAILING COMMENT - a shell comment runs to end of line and
  // swallows quotes and apostrophes without interpreting them, which a leading
  // `: 'cmd';` prefix does not (it breaks on `echo it's fine`).
  // Newlines are flattened, otherwise the comment would swallow the next line.
  const readable = cmd.replace(/\s*\n\s*/g, ' ').trim()
  // Single quotes keep spaces and backslashes literal (a Windows hookDir is full
  // of both), but they do not survive an apostrophe in the path: `'` has to be
  // closed, escaped and reopened. `/home/o'brien/...` is rarer than a space, not
  // rarer than never.
  const helper = quoteForShell(join(hookDir, 'truncate-bash-output.mjs'))
  return `TRUNCATE_CMD_B64=${encoded} node ${helper} # ${readable}`
}

/** POSIX single-quoting: the only form that is literal for every other character. */
export function quoteForShell(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function readStdin(): string {
  try {
    return readFileSync(0, 'utf-8')
  } catch {
    return ''
  }
}

function main(): void {
  const raw = readStdin()
  if (!raw) return

  let parsed: HookInput
  try {
    parsed = JSON.parse(raw)
  } catch {
    return
  }

  if (parsed.tool_name !== 'Bash') return

  const cmd = parsed.tool_input?.command ?? ''
  if (!cmd || !isVerboseCommand(cmd)) return

  // Resolving the hooks directory: the CLAUDE_PROJECT_DIR variable takes priority,
  // otherwise a path relative to this file (for local execution / tests).
  // fileURLToPath, never URL.pathname: on win32 the latter yields a percent-encoded
  // "/C:/Users/First%20LAST/..." that no shell and no runtime can resolve.
  const hookDir = process.env.CLAUDE_PROJECT_DIR
    ? join(process.env.CLAUDE_PROJECT_DIR, '.claude', 'hooks')
    : fileURLToPath(new URL('.', import.meta.url)).replace(/[\\/]$/, '')

  const output = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      permissionDecisionReason: 'Auto-truncate verbose output (truncate-output hook)',
      updatedInput: {
        command: wrapCommand(cmd, hookDir),
      },
    },
  }
  process.stdout.write(JSON.stringify(output))
}

// Compare URLs, never parse the path: pathToFileURL normalizes the separator,
// so this holds on win32 where a basename split on "/" never matches, and it is
// blind to the .ts -> .mjs rename the build performs. Both traps cost us a
// silently dead hook once each (see docs/postmortems/2026-08-24-hook-portability.md).
const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href
if (isMain) main()


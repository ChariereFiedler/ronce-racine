#!/usr/bin/env node
/**
 * PreToolUse hook for Bash: refuses to READ a project file through the shell
 * (`sed -n`, `cat`) or to CREATE one with a heredoc (`cat > file <<EOF`), where
 * the Read and Write tools already exist.
 *
 * Why it earns a blocked turn. Measured on a real agent run (2026-09-19, 32
 * minutes, $14.15): 43 of its 101 Bash calls were file reads — 18 `sed -n`, 11
 * `cat`, 14 `grep` — pouring 125k characters into the context. A run pays for
 * its whole context on EVERY call, so a 10k `cat` at call 20 is billed again by
 * the 260 calls that follow. Read with offset/limit reads the same lines
 * without that tail.
 *
 * `cat > file <<EOF` has a second, quieter cost: a file created that way never
 * triggers the PostToolUse hooks scoped on `Write|Edit`, so it sees neither
 * formatter, nor linter, nor secret scan.
 *
 * Bounded reads are left alone (`| head`, `| tail`, `grep -l/-c/-q`): they were
 * already a deliberate choice about volume. So are scratch paths (/tmp,
 * scratchpad) — this guard is about project files, not throwaway ones.
 *
 * Bypass strategy: if the command contains `# no-read-guard`, it is allowed
 * through — for the case the rule did not foresee.
 *
 * @version 1.0.0
 * @last-reviewed 2026-09-19
 */
import { readFileSync } from 'node:fs'

interface HookInput {
  tool_name?: string
  tool_input?: { command?: string }
}

/** Extensions that make a path a project file worth reading with a real tool. */
const PROJECT_FILE = /\.(ts|tsx|js|jsx|mjs|cjs|vue|rs|py|go|java|rb|md|ya?ml|json|toml|css|scss|html)\b/

const SCRATCH = /(^|\/)(tmp|scratchpad|scratch-|\.scratch)/

/** Already bounded, or explicitly opted out: nothing to teach here. */
const ALLOWED = [
  /\|\s*(head|tail|wc|grep|jq|sort|uniq|cut|awk)\b/,
  /#\s*no-read-guard/,
]

export interface GuardVerdict {
  deny: boolean
  reason?: string
}

/** First path in the command that looks like a project file, if any. */
function projectFileIn(cmd: string): string | null {
  for (const token of cmd.split(/\s+/)) {
    const path = token.replace(/^['"]|['"];?$/g, '')
    if (PROJECT_FILE.test(path) && !SCRATCH.test(path)) return path
  }
  return null
}

export function evaluate(cmd: string): GuardVerdict {
  if (!cmd.trim() || ALLOWED.some(p => p.test(cmd))) return { deny: false }

  // `cat > file <<EOF` — creation, checked before the read cases: it also
  // matches `cat`, and the advice to give is a different one.
  if (/\bcat\s*>\s*\S/.test(cmd)) {
    const path = projectFileIn(cmd)
    if (!path) return { deny: false }
    return {
      deny: true,
      reason:
        `Use Write instead of \`cat > ${path} <<EOF\`. A file created through the shell ` +
        'never triggers the PostToolUse hooks scoped on Write|Edit, so it sees neither ' +
        'formatter, nor linter, nor secret scan. Add `# no-read-guard` to override.',
    }
  }

  const isSedRead = /^\s*sed\s+-n\b/.test(cmd)
  const isCatRead = /^\s*cat\s+(?![<>])/.test(cmd)
  if (!isSedRead && !isCatRead) return { deny: false }

  const path = projectFileIn(cmd)
  if (!path) return { deny: false }

  const how = isSedRead
    ? `Read with offset/limit reads the same range of ${path}`
    : `Read reads ${path}`
  return {
    deny: true,
    reason:
      `${how}, with line numbers and without pouring the whole file into a context ` +
      'that every later call pays for again. Add `# no-read-guard` to override.',
  }
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
    parsed = JSON.parse(raw) as HookInput
  } catch {
    return
  }
  if (parsed.tool_name !== 'Bash') return

  const verdict = evaluate(parsed.tool_input?.command ?? '')
  if (!verdict.deny) return

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: verdict.reason,
      },
    }),
  )
}

// Compare URLs rather than parse paths: the separator differs on win32 and the
// build renames .ts to .mjs, two traps that each cost a silently dead hook.
import { pathToFileURL } from 'node:url'
const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href
if (isMain) main()

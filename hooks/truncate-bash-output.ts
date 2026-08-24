#!/usr/bin/env node
/**
 * Helper script invoked by truncate-output.ts (PreToolUse hook).
 * Runs a bash command (decoded from the TRUNCATE_CMD_B64 variable),
 * captures the output and truncates it if the command succeeds and the output
 * exceeds the character threshold.
 * On error (exit ≠ 0), the full output is preserved for debugging.
 *
 * @version 1.1.0
 * @last-reviewed 2026-08-24
 */
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export const THRESHOLD = 4000
export const HEAD_LINES = 20
export const TAIL_LINES = 20

export function truncateOutput(output: string): string {
  if (output.length <= THRESHOLD) return output

  const lines = output.split('\n')
  if (lines.length <= HEAD_LINES + TAIL_LINES) return output

  const omitted = lines.length - HEAD_LINES - TAIL_LINES
  const head = lines.slice(0, HEAD_LINES).join('\n')
  const tail = lines.slice(-TAIL_LINES).join('\n')
  return `${head}\n\n... [${omitted} lines omitted of ${lines.length}, ${output.length} chars total] ...\n\n${tail}`
}

function main(): void {
  const encoded = process.env.TRUNCATE_CMD_B64
  if (!encoded) process.exit(0)

  const cmd = Buffer.from(encoded, 'base64').toString('utf-8')

  const result = spawnSync('bash', ['-c', `( ${cmd}\n) 2>&1`], {
    encoding: 'utf-8',
    maxBuffer: 50 * 1024 * 1024,
    stdio: ['inherit', 'pipe', 'inherit'],
  })

  // A wrapper that cannot spawn must SAY so. Returning stdout ?? '' with exit 0
  // reported the user's command as a silent success and swallowed its output
  // whole - the worst outcome available, and the one a missing `bash` produces
  // (Git for Windows is optional; Claude Code then falls back to PowerShell).
  if (result.error) {
    process.stderr.write(`truncate-bash-output: cannot run the wrapped command (${result.error.message})\n`)
    process.exit(1)
  }

  const output = result.stdout ?? ''
  const exitCode = result.status ?? 1

  if (exitCode !== 0) {
    process.stdout.write(output)
    process.exit(exitCode)
  }

  process.stdout.write(truncateOutput(output))
}

// Compare URLs, never parse the path: pathToFileURL normalizes the separator,
// so this holds on win32 where a basename split on "/" never matches, and it is
// blind to the .ts -> .mjs rename the build performs. Both traps cost us a
// silently dead hook once each (see docs/postmortems/2026-08-24-hook-portability.md).
const isMain = import.meta.url === pathToFileURL(process.argv[1] ?? '').href
if (isMain) main()


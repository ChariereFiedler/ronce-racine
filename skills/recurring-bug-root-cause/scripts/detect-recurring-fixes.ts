#!/usr/bin/env npx tsx
/**
 * Detects recurring scopes: N+ `fix(scope):` commits within a sliding window.
 * Generic version (any git repo, conventional commits) of acme-app's retro-fixes.ts.
 * Usage: npx tsx detect-recurring-fixes.ts [--window 14] [--threshold 3] [repoDir]
 * Exit: 0 if no scope reaches the threshold, 1 otherwise (usable as a CI check).
 */
import { execSync } from 'node:child_process'

const args = process.argv.slice(2)
function opt(flag: string, def: number): number {
  const i = args.indexOf(flag)
  return i >= 0 ? Number(args[i + 1]) : def
}
const windowDays = opt('--window', 14)
const threshold = opt('--threshold', 3)
const repo = args.filter((a) => !a.startsWith('--') && !/^\d+$/.test(a)).pop() ?? process.cwd()

const log = execSync(`git -C "${repo}" log --since="${windowDays} days ago" --no-merges --pretty=%h%ad%s --date=short`, {
  encoding: 'utf-8',
})

const byScope = new Map<string, Array<{ hash: string; date: string; subject: string }>>()
for (const line of log.split('\n').filter(Boolean)) {
  const [hash, date, subject] = line.split('')
  const m = subject.match(/^fix\(([^)]+)\)/) ?? (subject.startsWith('fix:') ? [null, '(no-scope)'] : null)
  if (!m) continue
  const scope = m[1]
  byScope.set(scope, [...(byScope.get(scope) ?? []), { hash, date, subject }])
}

const offenders = [...byScope].filter(([, fixes]) => fixes.length >= threshold).sort((a, b) => b[1].length - a[1].length)

console.log(`# fix(scope) recurrences - ${windowDays}d window, threshold ${threshold}\n`)
if (!offenders.length) {
  console.log('No scope at the threshold. ✅')
  process.exit(0)
}
for (const [scope, fixes] of offenders) {
  const level = fixes.length >= 5 ? '🔴 root-cause REQUIRED before any new fix' : '🟡 postmortem recommended'
  console.log(`## ${scope} - ${fixes.length} fixes ${level}`)
  for (const f of fixes) console.log(`- ${f.date} ${f.hash} ${f.subject}`)
  console.log()
}
console.log('→ Apply the recurring-bug-root-cause skill: map the class, spike hypotheses, tooled guardrail, class tests.')
process.exit(1)

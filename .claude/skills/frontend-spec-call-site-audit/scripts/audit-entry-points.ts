#!/usr/bin/env npx tsx
/**
 * Pre-fills the codebase audit of a frontend ticket: call sites, incoming links
 * to the route, global navigation files (sidebar/header/menu) affected.
 * Usage: npx tsx audit-entry-points.ts <ComponentName|-> <route|-> [rootDir]
 *   e.g. audit-entry-points.ts WebhookList /webhooks ./frontend
 *   "-" to omit either of the two criteria.
 * Zero dependencies - node builtins only.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'

const [component, route, root = process.cwd()] = process.argv.slice(2)
if (!component) {
  console.error('Usage: audit-entry-points.ts <ComponentName|-> <route|-> [rootDir]')
  process.exit(2)
}

const EXT = new Set(['.vue', '.ts', '.tsx', '.js', '.jsx', '.svelte', '.html'])
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.nuxt', '.next', '.output', 'coverage'])
const NAV_HINT = /sidebar|nav|header|menu|breadcrumb|layout/i

const files: string[] = []
function walk(dir: string): void {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP.has(e.name)) walk(path.join(dir, e.name))
    } else if (EXT.has(path.extname(e.name))) files.push(path.join(dir, e.name))
  }
}
walk(root)

function grep(pattern: RegExp): Array<{ file: string; line: number; text: string }> {
  const out: Array<{ file: string; line: number; text: string }> = []
  for (const file of files) {
    fs.readFileSync(file, 'utf-8')
      .split('\n')
      .forEach((text, i) => {
        if (pattern.test(text)) out.push({ file: path.relative(root, file), line: i + 1, text: text.trim().slice(0, 100) })
      })
  }
  return out
}

function section(title: string, hits: Array<{ file: string; line: number; text: string }>): void {
  console.log(`\n## ${title}\n`)
  if (!hits.length) {
    console.log('_No results - to interpret: new component/route, or criterion to broaden._')
    return
  }
  for (const h of hits.slice(0, 40)) console.log(`- ${h.file}:${h.line} - ${h.text}`)
  if (hits.length > 40) console.log(`… ${hits.length - 40} more`)
}

console.log(`# Preliminary codebase audit - component: ${component} · route: ${route ?? '-'}\n`)
console.log(`Scanned root: ${root} (${files.length} files)`)

if (component !== '-') {
  const kebab = component
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
  section(`Call sites of ${component}`, grep(new RegExp(`<${component}[\\s/>]|<${kebab}[\\s/>]|\\b${component}\\b`)))
}
if (route && route !== '-') {
  const esc = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  section(`Incoming links to ${route}`, grep(new RegExp(`["'\`]${esc}`)))
}

const navFiles = files.filter((f) => NAV_HINT.test(path.basename(f)))
console.log(`\n## Global navigation - files to audit manually (sidebar, header, "+ New")\n`)
for (const f of navFiles.slice(0, 30)) console.log(`- [ ] ${path.relative(root, f)}`)
if (!navFiles.length) console.log('_No navigation file detected by name heuristic - search manually._')

console.log(`\n## Reminders to complete in the ticket
- [ ] Data scope: global / per organization / per project?
- [ ] Edge cases: 0 entities (empty+CTA) · 1 entity · N entities (pagination) · backend error · loading
- [ ] i18n: keys listed or "not applicable" justified
- [ ] ≥ 1 scenario as a complete user flow (creation from anywhere, going back, 0/1/N)`)

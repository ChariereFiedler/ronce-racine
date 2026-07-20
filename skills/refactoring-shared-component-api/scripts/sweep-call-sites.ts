#!/usr/bin/env npx tsx
/**
 * Exhaustive sweep of a shared component's call sites.
 * Usage: npx tsx sweep-call-sites.ts <ComponentName> [rootDir]
 * Output: markdown checklist of call sites (PascalCase, kebab-case,
 * dynamic usages, spreads, suspicious wrappers, stories/fixtures/mocks).
 * Zero dependency - node builtins only.
 */
import * as fs from 'node:fs'
import * as path from 'node:path'

const [name, root = process.cwd()] = process.argv.slice(2)
if (!name) {
  console.error('Usage: sweep-call-sites.ts <ComponentName> [rootDir]')
  process.exit(2)
}

const kebab = name
  .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
  .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
  .toLowerCase()
const EXT = new Set(['.vue', '.ts', '.tsx', '.js', '.jsx', '.svelte', '.html'])
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '.nuxt', '.next', '.output', 'coverage'])

interface Hit {
  file: string
  line: number
  text: string
  kind: string
}
const hits: Hit[] = []

function classify(text: string, file: string): string | null {
  const base = path.basename(file)
  if (new RegExp(`<${name}[\\s/>]`).test(text)) return 'tag PascalCase'
  if (new RegExp(`<${kebab}[\\s/>]`).test(text)) return 'tag kebab-case'
  if (/:is=|<component\b/.test(text) && text.includes(name)) return 'dynamic usage (:is/component)'
  if (/v-bind="(?!\$attrs)|\{\.\.\./.test(text) && text.includes(name)) return 'potential spread'
  if (new RegExp(`\\b${name}\\b`).test(text)) {
    if (/\.(spec|test|stories)\./.test(base)) return 'test/story'
    if (/mock|fixture/i.test(file)) return 'mock/fixture'
    return 'reference (import, type, doc)'
  }
  return null
}

function walk(dir: string): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP.has(entry.name)) walk(path.join(dir, entry.name))
      continue
    }
    if (!EXT.has(path.extname(entry.name))) continue
    const file = path.join(dir, entry.name)
    const lines = fs.readFileSync(file, 'utf-8').split('\n')
    lines.forEach((text, i) => {
      const kind = classify(text, file)
      if (kind) hits.push({ file: path.relative(root, file), line: i + 1, text: text.trim().slice(0, 100), kind })
    })
  }
}
walk(root)

const selfFile = (f: string) => path.basename(f).startsWith(`${name}.`)
const external = hits.filter((h) => !selfFile(h.file))
const wrappers = [...new Set(external.map((h) => h.file))].filter((f) => {
  const base = path.basename(f, path.extname(f))
  return base !== name && (base.includes(name) || /legacy|wrapper|compat|adapter/i.test(base))
})

console.log(`# Sweep call sites - ${name} (kebab: ${kebab})\n`)
if (wrappers.length) {
  console.log('## ⚠️ Suspicious wrappers/adapters - FIRST-CLASS call sites\n')
  for (const w of wrappers) console.log(`- [ ] ${w}`)
  console.log()
}
console.log('## Call sites to migrate\n')
const byFile = new Map<string, Hit[]>()
for (const h of external) byFile.set(h.file, [...(byFile.get(h.file) ?? []), h])
for (const [file, fileHits] of [...byFile].sort()) {
  console.log(`- [ ] **${file}**`)
  for (const h of fileHits) console.log(`      L${h.line} [${h.kind}] ${h.text}`)
}
console.log(`\nTotal: ${byFile.size} file(s), ${external.length} occurrence(s).`)
console.log('Reminder: after migration, grepping the old prop name must return 0 occurrences among these consumers.')

#!/usr/bin/env tsx
/**
 * Checks a ronce policy file the way the mod loads it: well-formed rules, compiling patterns, examples that hold.
 *   npx tsx tools/ronce-policy.ts <path/to/.claude/ronce.json>
 */
import { readFileSync } from 'node:fs'
import { DEFAULT_RULES } from '../mods/ronce/src/policy/defaults.ts'
import { loadPolicy } from '../mods/ronce/src/policy/load.ts'

const file = process.argv[2]
if (!file) {
  process.stderr.write('usage : npx tsx tools/ronce-policy.ts <fichier de politique>\n')
  process.exit(2)
}
const policy = loadPolicy(DEFAULT_RULES, readFileSync(file, 'utf8'))
const enforced = policy.rules.filter(rule => rule.mode === 'enforce').length
process.stdout.write(`${policy.rules.length} règles actives, dont ${enforced} en enforce\n`)
for (const error of policy.errors) process.stderr.write(`✗ ${error}\n`)
process.exit(policy.errors.length === 0 ? 0 : 1)

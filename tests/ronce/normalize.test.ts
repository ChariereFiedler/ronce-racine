import { describe, expect, it } from 'vitest'
import { allowedRuleIds, normalizeCommand, stripCdToCwd } from '../../mods/ronce/src/policy/normalize.ts'
import { toRawCall } from '../../mods/ronce/src/policy/raw-call.ts'
import { DEFAULT_RULES } from '../../mods/ronce/src/policy/defaults.ts'
import { evaluate } from '../../mods/ronce/src/policy/evaluate.ts'

const FACTS = { cwd: '/repo', env: {}, isInteractive: true }

describe('normalizeCommand', () => {
  it('drops leading cd and export prefixes and keeps the cd target', () => {
    const n = normalizeCommand('cd /repo/wt && export A=1; sed -n 1,80p src/main.rs')
    expect(n.normalized).toBe('sed -n 1,80p src/main.rs')
    expect(n.cwdTarget).toBe('/repo/wt')
  })

  it('handles a quoted cd target', () => {
    expect(normalizeCommand('cd "/repo/my wt" && ls').normalized).toBe('ls')
  })

  it('leaves separators inside a quoted argument alone', () => {
    const command = 'git commit -m "fix; cd /repo && x"'
    expect(normalizeCommand(command).normalized).toBe(command)
  })

  it('leaves a command without prefix untouched', () => {
    expect(normalizeCommand('git status')).toEqual({ normalized: 'git status', cwdTarget: null, allowed: [] })
  })

  it('reads git -C <path> X as git X, wherever it stands in the command', () => {
    expect(normalizeCommand('git -C /repo/wt commit -m "x"').normalized).toBe('git commit -m "x"')
    expect(normalizeCommand('git -C "/repo/my wt" add -A && git -C ../wt push').normalized).toBe('git add -A && git push')
  })
})

describe('default rules on git -C', () => {
  it('refuses a commit message naming the assistant even when git runs with -C', () => {
    const verdicts = evaluate(DEFAULT_RULES, { tool: 'Bash', command: 'git -C /repo/wt commit -q -m "chore: x" -m "Co-Authored-By: Claude"' }, FACTS)
    expect(verdicts.map(v => v.ruleId)).toContain('commit-mentions-ai')
  })
})

describe('allowedRuleIds', () => {
  it('reads several ids after ronce:allow', () => {
    expect(allowedRuleIds('npx vue-tsc # ronce:allow npx-vue-tsc, shell-read')).toEqual(['npx-vue-tsc', 'shell-read'])
  })

  it('maps the legacy no-read-guard marker to the two shell rules', () => {
    expect(allowedRuleIds('cat x.ts # no-read-guard')).toEqual(['shell-read', 'heredoc-create'])
  })

  it('reads nothing when there is no marker', () => {
    expect(allowedRuleIds('git status')).toEqual([])
  })
})

describe('stripCdToCwd', () => {
  it('strips cd to the session directory', () => {
    expect(stripCdToCwd('cd /repo && git status', '/repo')).toBe('git status')
  })

  it('accepts a trailing slash and a semicolon', () => {
    expect(stripCdToCwd('cd /repo/ ; ls', '/repo')).toBe('ls')
  })

  it('refuses another directory', () => {
    expect(stripCdToCwd('cd /repo/backend && cargo test', '/repo')).toBeNull()
  })

  it('refuses a cd with nothing after it', () => {
    expect(stripCdToCwd('cd /repo && ', '/repo')).toBeNull()
  })
})

describe('toRawCall', () => {
  it('keeps the fields the rules read and maps Edit new_string to content', () => {
    expect(toRawCall({ tool: 'Edit', file_path: '/r/a.ts', old_string: 'a', new_string: 'b' })).toEqual({
      tool: 'Edit', command: undefined, file_path: '/r/a.ts', content: 'b', limit: undefined,
      prompt: undefined, subagent_type: undefined, model: undefined,
    })
  })
})

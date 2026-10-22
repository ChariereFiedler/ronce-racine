import { describe, expect, it } from 'vitest'
import { DEFAULT_RULES } from '../../mods/ronce/src/policy/defaults.ts'
import { loadPolicy } from '../../mods/ronce/src/policy/load.ts'

const policy = (body: object): string => JSON.stringify({ version: 1, ...body })

describe('loadPolicy', () => {
  it('keeps every default rule, enforcing the unambiguous guards, when there is no file', () => {
    const loaded = loadPolicy(DEFAULT_RULES, null)
    expect(loaded.errors).toEqual([])
    expect(loaded.rules.map(r => r.id)).toEqual(DEFAULT_RULES.map(r => r.id))
    expect(loaded.rules.filter(r => r.mode === 'enforce').map(r => r.id).sort()).toEqual([
      'cd-cwd-noop', 'commit-mentions-ai', 'destructive-after-semicolon', 'devnull-hides-errors',
      'heredoc-create', 'shell-read', 'zsh-wordsplit',
    ])
    expect(loaded.rules.find(r => r.id === 'agent-prompt-too-large')?.mode).toBe('shadow')
  })

  it('shapes outputs by default, keeping the whole of them under the home directory', () => {
    const loaded = loadPolicy(DEFAULT_RULES, null)
    expect(loaded.shaping.mode).toBe('enforce')
    expect(loaded.shaping.dir).toBe('~/.claude/ronce/outputs')
  })

  it('falls back to the defaults on invalid JSON, saying why', () => {
    const loaded = loadPolicy(DEFAULT_RULES, '{ nope')
    expect(loaded.rules).toHaveLength(DEFAULT_RULES.length)
    expect(loaded.errors[0]).toContain('JSON invalide')
  })

  it('ignores a file of another version', () => {
    expect(loadPolicy(DEFAULT_RULES, JSON.stringify({ version: 2 })).errors[0]).toContain('version 1 attendue')
  })

  it('applies disable, modes and same-id replacement', () => {
    const loaded = loadPolicy(DEFAULT_RULES, policy({
      disable: ['zsh-wordsplit'],
      modes: { 'shell-read': 'enforce' },
      rules: [{ id: 'devnull-hides-errors', tool: 'Bash', command: '2>/dev/null', action: 'warn', mode: 'shadow', message: 'm' }],
    }))
    expect(loaded.rules.find(r => r.id === 'zsh-wordsplit')).toBeUndefined()
    expect(loaded.rules.find(r => r.id === 'shell-read')?.mode).toBe('enforce')
    expect(loaded.rules.find(r => r.id === 'devnull-hides-errors')?.command).toBe('2>/dev/null')
  })

  it('drops a rule with no criterion, a bad regex or a rewrite without builtin', () => {
    const loaded = loadPolicy([], policy({ rules: [
      { id: 'all', tool: 'Bash', action: 'deny', mode: 'shadow', message: 'm' },
      { id: 'bad-re', tool: 'Bash', command: '(', action: 'deny', mode: 'shadow', message: 'm' },
      { id: 'rw', tool: 'Bash', command: 'x', action: 'rewrite', mode: 'shadow', message: 'm' },
    ] }))
    expect(loaded.rules).toEqual([])
    expect(loaded.errors).toHaveLength(3)
  })

  it('drops a rule that fails its own examples', () => {
    const loaded = loadPolicy([], policy({ rules: [
      { id: 'r', tool: 'Bash', command: 'foo', action: 'warn', mode: 'shadow', message: 'm',
        examples: { match: [{ command: 'bar' }], pass: [] } },
    ] }))
    expect(loaded.rules).toEqual([])
    expect(loaded.errors[0]).toContain('devrait matcher')
  })

  it('replays examples without the session conditions', () => {
    const loaded = loadPolicy([], policy({ rules: [
      { id: 'agent-only', tool: 'Bash', command: 'git push', action: 'warn', mode: 'shadow', message: 'm',
        when: { env: { CLAUDE_AGENT: '1' } }, examples: { match: [{ command: 'git push' }], pass: [] } },
    ] }))
    expect(loaded.errors).toEqual([])
  })

  it('turns on the generic features by default and leaves the project-specific ones off', () => {
    const { features } = loadPolicy(DEFAULT_RULES, null)
    expect(features.worktree).toEqual({ links: ['.env'] })
    expect(features.memo).toEqual({ ticketPattern: '(?:feat|fix|chore)\\/(\\d+)', staleDays: 14 })
    expect(features.band).toBe(true)
    expect(features.freshness).toBeNull()
    expect(features.agentBudget).toBeNull()
    expect(features.skillHints).toEqual([])
  })

  it('takes the project features, and drops a skill hint whose pattern does not compile', () => {
    const loaded = loadPolicy([], policy({
      freshness: { remote: 'origin', branch: 'master' },
      memo: { decisionsFile: '.claude/decisions.md' },
      skillHints: [
        { pattern: 'pipeline (a échoué|ko)', skill: 'pipeline-orchestration', reason: 'pipeline évoqué' },
        { pattern: '(', skill: 'broken', reason: 'x' },
      ],
    }))
    expect(loaded.features.freshness).toEqual({ remote: 'origin', branch: 'master' })
    expect(loaded.features.memo).toEqual({ ticketPattern: '(?:feat|fix|chore)\\/(\\d+)', staleDays: 14, decisionsFile: '.claude/decisions.md' })
    expect(loaded.features.skillHints.map(h => h.skill)).toEqual(['pipeline-orchestration'])
    expect(loaded.errors[0]).toContain('skillHints')
  })

  it('runs the generic checks by default, and lets a project replace a list', () => {
    const defaults = loadPolicy(DEFAULT_RULES, null).features.checks
    expect(defaults.onEdit.map(c => c.id)).toEqual(['rustfmt', 'eslint', 'biome-scripts', 'ast-grep'])
    expect(defaults.background.map(c => c.id)).toEqual(['vitest-related'])
    const replaced = loadPolicy([], policy({ checks: { onEdit: [] } })).features.checks
    expect(replaced.onEdit).toEqual([])
    expect(replaced.background.map(c => c.id)).toEqual(['vitest-related'])
  })

  it('drops a check whose pattern does not compile', () => {
    const loaded = loadPolicy([], policy({ checks: { onEdit: [{ id: 'bad', title: 'x', match: '(', run: ['x'], timeoutMs: 1, maxLines: 1 }] } }))
    expect(loaded.features.checks.onEdit).toEqual([])
    expect(loaded.errors[0]).toContain('checks')
  })

  it('lets a project turn a generic feature off', () => {
    const { features } = loadPolicy([], policy({ worktree: null, memo: null, band: false }))
    expect(features.worktree).toBeNull()
    expect(features.memo).toBeNull()
    expect(features.band).toBe(false)
  })

  it('lets a project turn telemetry off, and rejects an unknown shaping mode', () => {
    expect(loadPolicy([], policy({ telemetry: null })).telemetry).toBeNull()
    const loaded = loadPolicy([], policy({ shaping: { mode: 'loud' } }))
    expect(loaded.shaping.mode).toBe('enforce')
    expect(loaded.errors[0]).toContain('shaping.mode')
  })
})

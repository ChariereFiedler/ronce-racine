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
      'fix-needs-ticket', 'heredoc-create', 'shell-read', 'sleep-poll', 'ticket-needs-skill',
      'zsh-wordsplit',
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

  it('has no ticket configuration by default, and takes a project one', () => {
    expect(loadPolicy(DEFAULT_RULES, null).features.ticket).toBeNull()
    const ticket = { skill: 'write-github-issue', headings: ['## Problem', ['## Reproduction', '## Current behaviour']], labels: ['bug'] }
    const loaded = loadPolicy(DEFAULT_RULES, policy({ ticket }))
    expect(loaded.errors).toEqual([])
    expect(loaded.features.ticket).toEqual(ticket)
  })

  it('drops a ticket configuration without a skill or headings, saying why', () => {
    for (const ticket of [{ headings: ['## Problem'] }, { skill: 'w', headings: [] }, { skill: 'w', headings: [1] }]) {
      const loaded = loadPolicy(DEFAULT_RULES, policy({ ticket }))
      expect(loaded.features.ticket, JSON.stringify(ticket)).toBeNull()
      expect(loaded.errors[0]).toContain('ticket')
    }
  })

  it('lets a project turn telemetry off, and rejects an unknown shaping mode', () => {
    expect(loadPolicy([], policy({ telemetry: null })).telemetry).toBeNull()
    const loaded = loadPolicy([], policy({ shaping: { mode: 'loud' } }))
    expect(loaded.shaping.mode).toBe('enforce')
    expect(loaded.errors[0]).toContain('shaping.mode')
  })

  describe('fixRepeat', () => {
    it('is on in shadow with 3 fixes in 48 hours by default', () => {
      expect(loadPolicy([], null).features.fixRepeat).toEqual({ limit: 3, windowHours: 48, mode: 'shadow' })
    })

    it('can be turned off with null', () => {
      expect(loadPolicy([], policy({ fixRepeat: null })).features.fixRepeat).toBeNull()
    })

    it('lets a project enforce it and change the limit', () => {
      const loaded = loadPolicy([], policy({ fixRepeat: { mode: 'enforce', limit: 4 } }))
      expect(loaded.features.fixRepeat).toEqual({ limit: 4, windowHours: 48, mode: 'enforce' })
    })

    it('keeps the defaults and reports an error for a limit under 2 or an unknown mode', () => {
      const lowLimit = loadPolicy([], policy({ fixRepeat: { limit: 1 } }))
      expect(lowLimit.features.fixRepeat?.limit).toBe(3)
      expect(lowLimit.errors[0]).toContain('fixRepeat')
      const badMode = loadPolicy([], policy({ fixRepeat: { mode: 'loud' } }))
      expect(badMode.features.fixRepeat?.mode).toBe('shadow')
      expect(badMode.errors[0]).toContain('fixRepeat')
    })
  })

  describe('contextSignal', () => {
    const thresholdsOf = (body: object): number[] | undefined =>
      loadPolicy([], policy(body)).features.contextSignal?.thresholds

    it('is on by default with the measured thresholds', () => {
      expect(loadPolicy([], null).features.contextSignal).toEqual({ thresholds: [40, 60, 75] })
    })

    it('can be turned off with null', () => {
      expect(loadPolicy([], policy({ contextSignal: null })).features.contextSignal).toBeNull()
    })

    it('sorts the thresholds a project gives', () => {
      expect(thresholdsOf({ contextSignal: { thresholds: [75, 40] } })).toEqual([40, 75])
    })

    it('keeps the defaults and reports an error for an empty list', () => {
      const loaded = loadPolicy([], policy({ contextSignal: { thresholds: [] } }))
      expect(loaded.features.contextSignal?.thresholds).toEqual([40, 60, 75])
      expect(loaded.errors[0]).toContain('contextSignal.thresholds')
    })

    it('keeps the defaults and reports an error for a threshold outside 1 to 100', () => {
      const loaded = loadPolicy([], policy({ contextSignal: { thresholds: [150] } }))
      expect(loaded.features.contextSignal?.thresholds).toEqual([40, 60, 75])
      expect(loaded.errors[0]).toContain('contextSignal.thresholds')
    })
  })
})

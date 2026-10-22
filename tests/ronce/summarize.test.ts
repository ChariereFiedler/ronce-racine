import { describe, expect, it } from 'vitest'
import type { TelemetryEvent, ToolEvent } from '../../mods/ronce/types'
import { formatSummary, summarize } from '../../mods/ronce/src/report/summarize.ts'

const TS = '2026-10-09T10:00:00.000Z'
const tool = (over: Partial<ToolEvent>): ToolEvent => ({
  type: 'tool', ts: TS, sessionId: 's1', projectDir: '/repo', tool: 'Bash', success: true, denied: false,
  durationMs: 1, command: 'git status', normalized: 'git status', rules: [], ...over,
})
const turn = (sessionId: string, costUsd: number): TelemetryEvent => ({ type: 'turn', ts: TS, sessionId, projectDir: '/repo', costUsd })

describe('summarize', () => {
  it('computes shares, repetitions, failures and cost per 1 000 calls', () => {
    const summary = summarize([
      tool({ command: 'cd /repo && git status', rules: [{ id: 'cd-cwd-noop', mode: 'shadow', action: 'rewrite', bypassed: false }] }),
      tool({}),
      tool({}),
      tool({ command: 'sed -n 1,9p a.ts', normalized: 'sed -n 1,9p a.ts', success: false,
        rules: [{ id: 'shell-read', mode: 'shadow', action: 'deny', bypassed: false }] }),
      tool({ tool: 'Read', command: undefined, normalized: undefined, sessionId: 's2' }),
      turn('s1', 0.5),
      turn('s1', 1.5),
      turn('s2', 1),
    ])
    expect(summary).toMatchObject({ sessions: 2, toolCalls: 5, bashCalls: 4, repetitions: 2 })
    expect(summary.cdPrefixShare).toBeCloseTo(0.25)
    expect(summary.cdToCwdShare).toBeCloseTo(0.25)
    expect(summary.shellReadShare).toBeCloseTo(0.25)
    expect(summary.failureRate).toBeCloseTo(0.2)
    expect(summary.costUsd).toBeCloseTo(2.5)
    expect(summary.costPer1000Calls).toBeCloseTo(500)
    expect(summary.rules['shell-read']).toEqual({ shadow: 1, enforce: 0, bypassed: 0 })
  })

  it('does not count a denial as a failure', () => {
    expect(summarize([tool({ success: false, denied: true })]).failureRate).toBe(0)
  })

  it('renders an empty period without dividing by zero', () => {
    const text = formatSummary(summarize([]))
    expect(text).toContain("| Appels d'outils | 0 |")
    expect(text).toContain('| $ pour 1 000 appels | n/a |')
  })
})

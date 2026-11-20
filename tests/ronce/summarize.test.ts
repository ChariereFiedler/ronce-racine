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

  it('measures the share of turns above 40 % and 60 % of the context', () => {
    const turns = [10, 45, 65, 80].map((contextPercent): TelemetryEvent => ({ type: 'turn', ts: TS, sessionId: 's1', projectDir: '/repo', contextPercent }))
    const summary = summarize(turns)
    expect(summary.turnsAbove40Share).toBeCloseTo(0.75)
    expect(summary.turnsAbove60Share).toBeCloseTo(0.5)
  })

  it('ignores turns with no context reading', () => {
    expect(summarize([turn('s1', 1)]).turnsAbove40Share).toBe(0)
  })

  it('measures how much of the cost the ten most expensive sessions hold', () => {
    const sessions = Array.from({ length: 12 }, (_, i) => turn(`s${i}`, i + 1))
    expect(summarize(sessions).top10CostShare).toBeCloseTo(75 / 78)
  })

  it('has no cost concentration without cost', () => {
    expect(summarize([]).top10CostShare).toBe(0)
  })

  it('counts fix commits that carry no ticket reference', () => {
    const commit = (command: string): ToolEvent => tool({ command, normalized: command })
    const summary = summarize([
      commit('git commit -m "fix(a): x"'),
      commit('git commit -m "fix(a): y (Refs #3)"'),
      commit('git commit -m "feat(a): z"'),
      commit('git commit --amend --no-edit'),
    ])
    expect(summary.unreferencedFixCommits).toBe(1)
  })

  it('renders the new indicators', () => {
    const text = formatSummary(summarize([]))
    expect(text).toContain('Tours au-delà de 40 % du contexte')
    expect(text).toContain('Tours au-delà de 60 % du contexte')
    expect(text).toContain('Part du coût des 10 sessions les plus chères')
    expect(text).toContain('Commits fix sans référence de ticket')
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

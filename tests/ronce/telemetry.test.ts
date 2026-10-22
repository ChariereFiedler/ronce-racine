import { describe, expect, it } from 'vitest'
import type { TelemetryEvent, Verdict } from '../../mods/ronce/types'
import { formatHits, mergeHits, recordHits, sampleOf } from '../../mods/ronce/src/policy/hits.ts'
import { BUFFER_CAP, appendCapped, batchPath, toJsonl, toolEvent, turnEvent } from '../../mods/ronce/src/telemetry/event.ts'
import { redact } from '../../mods/ronce/src/telemetry/redact.ts'

const TS = '2026-10-09T10:00:00.000Z'
const shadowRead: Verdict = { ruleId: 'shell-read', action: 'deny', mode: 'shadow', message: 'm', bypassed: false }
// Assembled at run time so that no secret scanner mistakes the test source for a leak.
const FAKE_GITLAB_TOKEN = ['glpat', 'abcdefghijklmnop'].join('-')
const FAKE_GITHUB_TOKEN = ['ghp', 'abcdefghijklmnopqrstuvwxyz0123'].join('_')

describe('redact', () => {
  it('masks tokens in headers, assignments and known formats', () => {
    expect(redact(`curl -H "PRIVATE-TOKEN: ${FAKE_GITLAB_TOKEN}" x`)).toBe('curl -H "PRIVATE-TOKEN: ***" x')
    expect(redact('GITLAB_TOKEN=abc123 npx tsx x')).toBe('GITLAB_TOKEN=*** npx tsx x')
    expect(redact(`echo ${FAKE_GITHUB_TOKEN}`)).toBe('echo ***')
  })

  it('masks the credentials of a URL, such as a DATABASE_URL', () => {
    expect(redact('DATABASE_URL=postgres://granit:s3cret@localhost:5432/db cargo test'))
      .toBe('DATABASE_URL=postgres://***@localhost:5432/db cargo test')
    expect(redact('curl https://bot:tok123@gitlab.example.com/x')).toBe('curl https://***@gitlab.example.com/x')
  })

  it('leaves a variable reference alone', () => {
    expect(redact('echo $GITLAB_TOKEN')).toBe('echo $GITLAB_TOKEN')
  })
})

describe('toolEvent', () => {
  it('records the redacted and normalized command with the rules hit', () => {
    const event = toolEvent({
      ts: TS, sessionId: 's', projectDir: '/repo',
      call: { tool: 'Bash', command: 'cd /repo && GITLAB_TOKEN=abc git status' },
      verdicts: [{ ruleId: 'cd-cwd-noop', action: 'rewrite', mode: 'shadow', message: 'm', bypassed: false }],
      outcome: { success: false, denied: false, durationMs: 12 },
    })
    expect(event).toEqual({
      type: 'tool', ts: TS, sessionId: 's', projectDir: '/repo', tool: 'Bash',
      success: false, denied: false, durationMs: 12,
      command: 'cd /repo && GITLAB_TOKEN=*** git status', normalized: 'GITLAB_TOKEN=*** git status',
      rules: [{ id: 'cd-cwd-noop', mode: 'shadow', action: 'rewrite', bypassed: false }],
    })
  })

  it('records the file of a file tool without a command', () => {
    const event = toolEvent({ ts: TS, sessionId: 's', projectDir: '/repo', call: { tool: 'Read', file_path: '/repo/a.ts' }, verdicts: [], outcome: { success: true, denied: false, durationMs: 3 } })
    expect(event.file_path).toBe('/repo/a.ts')
    expect(event.command).toBeUndefined()
  })
})

describe('buffer and batches', () => {
  it('caps the buffer, keeping the newest events', () => {
    let buffer: TelemetryEvent[] = []
    for (let i = 0; i <= BUFFER_CAP; i++) buffer = appendCapped(buffer, turnEvent({ ts: TS, sessionId: String(i), projectDir: '/r' }))
    expect(buffer).toHaveLength(BUFFER_CAP)
    expect(buffer[0]?.sessionId).toBe('1')
  })

  it('writes one JSON object per line and files batches by day', () => {
    const lines = toJsonl([turnEvent({ ts: TS, sessionId: 's', projectDir: '/r', costUsd: 1.5 }), turnEvent({ ts: TS, sessionId: 's', projectDir: '/r' })])
    expect(lines.split('\n')).toHaveLength(3)
    expect(JSON.parse(lines.split('\n')[0]!)).toMatchObject({ type: 'turn', costUsd: 1.5 })
    expect(batchPath('/h/.claude/ronce/events', TS, 's', 3)).toBe('/h/.claude/ronce/events/2026-10-09/s-00003.jsonl')
  })
})

describe('hit stats', () => {
  it('counts hits and bypasses, keeps redacted samples, and renders a table', () => {
    const once = recordHits({}, [shadowRead], 'cat GITLAB_TOKEN=abc')
    expect(once['shell-read']).toEqual({ mode: 'shadow', action: 'deny', count: 1, bypassed: 0, samples: ['cat GITLAB_TOKEN=***'] })
    const merged = mergeHits(once, recordHits({}, [{ ...shadowRead, bypassed: true }], 'x'))
    expect(merged['shell-read']).toMatchObject({ count: 2, bypassed: 1 })
    const table = formatHits(merged, ['erreur A'])
    expect(table).toContain('| shell-read | shadow | deny | 2 | 1 |')
    expect(table).toContain('- erreur A')
  })

  it('samples each kind of call by what identifies it', () => {
    expect(sampleOf({ tool: 'Bash', command: 'ls' })).toBe('ls')
    expect(sampleOf({ tool: 'Edit', file_path: '/r/a.ts' })).toBe('/r/a.ts')
    expect(sampleOf({ tool: 'Agent', subagent_type: 'Explore', prompt: 'Cherche X' })).toBe('Explore : Cherche X')
  })
})

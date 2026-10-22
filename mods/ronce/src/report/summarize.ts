import type { Mode, TelemetryEvent, ToolEvent, TurnEvent } from '../../types'

/** A command repeated this many times in one session counts as a loop, as in the Chardon reports. */
const TOIL_THRESHOLD = 3

export type Summary = {
  sessions: number
  toolCalls: number
  callsPerSession: number
  bashCalls: number
  /** Bash calls that started with a cd or export prefix. */
  cdPrefixShare: number
  /** Bash calls whose only prefix was a cd to the session directory. */
  cdToCwdShare: number
  shellReadShare: number
  /** Calls that failed; a denial is a decision, not a failure. */
  failureRate: number
  /** Σ (count − 1) over the (session, command) pairs seen at least TOIL_THRESHOLD times. */
  repetitions: number
  costUsd: number
  costPer1000Calls: number | null
  shapingSavedChars: number
  rules: Record<string, Record<Mode | 'bypassed', number>>
}

const share = (part: number, whole: number): number => (whole === 0 ? 0 : part / whole)
const hit = (event: ToolEvent, id: string): boolean => event.rules.some(rule => rule.id === id)

function countRepetitions(bash: readonly ToolEvent[]): number {
  const counts = new Map<string, number>()
  for (const event of bash) {
    const key = `${event.sessionId}\u0000${event.normalized ?? event.command ?? ''}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  let repetitions = 0
  for (const count of counts.values()) if (count >= TOIL_THRESHOLD) repetitions += count - 1
  return repetitions
}

/** The cost a turn event carries is the session's running total: keep the highest per session. */
function totalCost(turns: readonly TurnEvent[]): number {
  const latest = new Map<string, number>()
  for (const turn of turns) {
    if (turn.costUsd !== undefined) latest.set(turn.sessionId, Math.max(latest.get(turn.sessionId) ?? 0, turn.costUsd))
  }
  return [...latest.values()].reduce((sum, cost) => sum + cost, 0)
}

function ruleCounts(tools: readonly ToolEvent[]): Summary['rules'] {
  const counts: Summary['rules'] = {}
  for (const event of tools) {
    for (const rule of event.rules) {
      const row = counts[rule.id] ?? { shadow: 0, enforce: 0, bypassed: 0 }
      row[rule.mode] += 1
      if (rule.bypassed) row.bypassed += 1
      counts[rule.id] = row
    }
  }
  return counts
}

export function summarize(events: readonly TelemetryEvent[]): Summary {
  const tools = events.filter((e): e is ToolEvent => e.type === 'tool')
  const turns = events.filter((e): e is TurnEvent => e.type === 'turn')
  const bash = tools.filter(e => e.tool === 'Bash')
  const sessions = new Set(tools.map(e => e.sessionId)).size
  const costUsd = totalCost(turns)
  return {
    sessions,
    toolCalls: tools.length,
    callsPerSession: share(tools.length, sessions),
    bashCalls: bash.length,
    cdPrefixShare: share(bash.filter(e => e.command !== undefined && e.normalized !== e.command).length, bash.length),
    cdToCwdShare: share(bash.filter(e => hit(e, 'cd-cwd-noop')).length, bash.length),
    shellReadShare: share(bash.filter(e => hit(e, 'shell-read')).length, bash.length),
    failureRate: share(tools.filter(e => !e.success && !e.denied).length, tools.length),
    repetitions: countRepetitions(bash),
    costUsd,
    costPer1000Calls: tools.length === 0 ? null : (costUsd / tools.length) * 1000,
    shapingSavedChars: tools.reduce((sum, e) => sum + (e.shaping ? e.shaping.originalChars - e.shaping.keptChars : 0), 0),
    rules: ruleCounts(tools),
  }
}

const percent = (value: number): string => `${(value * 100).toFixed(1)} %`

export function formatSummary(s: Summary): string {
  const rows: [string, string][] = [
    ['Sessions', String(s.sessions)],
    ["Appels d'outils", String(s.toolCalls)],
    ['Appels par session', s.callsPerSession.toFixed(1)],
    ['Appels Bash', String(s.bashCalls)],
    ['Bash avec préfixe cd ou export', percent(s.cdPrefixShare)],
    ['Bash « cd <répertoire courant> »', percent(s.cdToCwdShare)],
    ['Lectures de fichiers par le shell', percent(s.shellReadShare)],
    ["Taux d'échec", percent(s.failureRate)],
    ['Répétitions (≥ 3 par session)', String(s.repetitions)],
    ['Coût cumulé', `${s.costUsd.toFixed(2)} $`],
    ['$ pour 1 000 appels', s.costPer1000Calls === null ? 'n/a' : `${s.costPer1000Calls.toFixed(2)} $`],
    ['Caractères que le façonnage retire ou retirerait', String(s.shapingSavedChars)],
  ]
  const rules = Object.entries(s.rules)
    .sort(([, a], [, b]) => b.shadow + b.enforce - (a.shadow + a.enforce))
    .map(([id, c]) => `| ${id} | ${c.shadow} | ${c.enforce} | ${c.bypassed} |`)
  return [
    '| Indicateur | Valeur |',
    '|---|---|',
    ...rows.map(([name, value]) => `| ${name} | ${value} |`),
    '',
    '| Règle | Shadow | Enforce | Contournements |',
    '|---|---|---|---|',
    ...rules,
  ].join('\n')
}

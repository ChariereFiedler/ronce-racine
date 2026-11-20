import type { Mode, TelemetryEvent, ToolEvent, TurnEvent } from '../../types'
import { commitSubject, parseFixSubject } from '../features/fix-repeat.ts'

/** A command repeated this many times in one session counts as a loop, as in the Chardon reports. */
const TOIL_THRESHOLD = 3
/** The cost concentration is measured on the sessions that matter most. */
const TOP_SESSIONS = 10

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
  /** Share of the turns with a context reading that sat above 40 % and above 60 % of the window. */
  turnsAbove40Share: number
  turnsAbove60Share: number
  /** Share of the total cost held by the ten most expensive sessions. */
  top10CostShare: number
  /** Fix commits made with a `-m` message that names no ticket. */
  unreferencedFixCommits: number
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
function costBySession(turns: readonly TurnEvent[]): number[] {
  const latest = new Map<string, number>()
  for (const turn of turns) {
    if (turn.costUsd !== undefined) latest.set(turn.sessionId, Math.max(latest.get(turn.sessionId) ?? 0, turn.costUsd))
  }
  return [...latest.values()]
}

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0)

function topCostShare(costs: readonly number[], count: number): number {
  const top = [...costs].sort((a, b) => b - a).slice(0, count)
  return share(sum(top), sum(costs))
}

function contextShareAbove(turns: readonly TurnEvent[], percentLimit: number): number {
  const known = turns.filter(turn => turn.contextPercent !== undefined)
  return share(known.filter(turn => (turn.contextPercent ?? 0) > percentLimit).length, known.length)
}

function countUnreferencedFixes(bash: readonly ToolEvent[]): number {
  return bash.filter(event => {
    const subject = event.command === undefined ? null : commitSubject(event.command)
    const fix = subject === null ? null : parseFixSubject(subject)
    return fix !== null && fix.ticket === null
  }).length
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
  const sessionCosts = costBySession(turns)
  const costUsd = sum(sessionCosts)
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
    turnsAbove40Share: contextShareAbove(turns, 40),
    turnsAbove60Share: contextShareAbove(turns, 60),
    top10CostShare: topCostShare(sessionCosts, TOP_SESSIONS),
    unreferencedFixCommits: countUnreferencedFixes(bash),
    shapingSavedChars: sum(tools.map(e => (e.shaping ? e.shaping.originalChars - e.shaping.keptChars : 0))),
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
    ['Tours au-delà de 40 % du contexte', percent(s.turnsAbove40Share)],
    ['Tours au-delà de 60 % du contexte', percent(s.turnsAbove60Share)],
    ['Part du coût des 10 sessions les plus chères', percent(s.top10CostShare)],
    ['Commits fix sans référence de ticket', String(s.unreferencedFixCommits)],
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

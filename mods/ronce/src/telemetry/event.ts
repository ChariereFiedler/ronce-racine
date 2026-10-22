import type { RawCall, RuleHitRef, TelemetryEvent, ToolEvent, TurnEvent, Verdict } from '../../types'
import { normalizeCommand } from '../policy/normalize.ts'
import { redact } from './redact.ts'

/** What the buffer keeps when flushes keep failing: the newest events. */
export const BUFFER_CAP = 2000
const MAX_COMMAND_CHARS = 2000
const SEQ_DIGITS = 5

export type ToolOutcome = { success: boolean; denied: boolean; durationMs: number; shaping?: ToolEvent['shaping'] }

const hitRef = (verdict: Verdict): RuleHitRef => ({
  id: verdict.ruleId, mode: verdict.mode, action: verdict.action, bypassed: verdict.bypassed,
})

export function toolEvent(args: {
  ts: string
  sessionId: string
  projectDir: string
  agentId?: string
  call: RawCall
  verdicts: readonly Verdict[]
  outcome: ToolOutcome
}): ToolEvent {
  const { call, outcome } = args
  const command = call.command === undefined ? undefined : redact(call.command).slice(0, MAX_COMMAND_CHARS)
  return {
    type: 'tool',
    ts: args.ts,
    sessionId: args.sessionId,
    projectDir: args.projectDir,
    ...(args.agentId ? { agentId: args.agentId } : {}),
    tool: call.tool,
    success: outcome.success,
    denied: outcome.denied,
    durationMs: outcome.durationMs,
    ...(command !== undefined ? { command, normalized: normalizeCommand(command).normalized } : {}),
    ...(call.file_path ? { file_path: call.file_path } : {}),
    ...(call.subagent_type ? { subagent_type: call.subagent_type } : {}),
    rules: args.verdicts.map(hitRef),
    ...(outcome.shaping ? { shaping: outcome.shaping } : {}),
  }
}

export function turnEvent(args: { ts: string; sessionId: string; projectDir: string; costUsd?: number; contextPercent?: number }): TurnEvent {
  return {
    type: 'turn',
    ts: args.ts,
    sessionId: args.sessionId,
    projectDir: args.projectDir,
    ...(args.costUsd !== undefined ? { costUsd: args.costUsd } : {}),
    ...(args.contextPercent !== undefined ? { contextPercent: args.contextPercent } : {}),
  }
}

export function appendCapped(buffer: readonly TelemetryEvent[], event: TelemetryEvent): TelemetryEvent[] {
  return [...buffer, event].slice(-BUFFER_CAP)
}

export function toJsonl(events: readonly TelemetryEvent[]): string {
  return `${events.map(event => JSON.stringify(event)).join('\n')}\n`
}

/** One file per flush: `<dir>/<YYYY-MM-DD>/<session>-<seq>.jsonl`. */
export function batchPath(dir: string, ts: string, sessionId: string, seq: number): string {
  return `${dir}/${ts.slice(0, 10)}/${sessionId}-${String(seq).padStart(SEQ_DIGITS, '0')}.jsonl`
}

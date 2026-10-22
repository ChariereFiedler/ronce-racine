import type { HitStats, RawCall, Verdict } from '../../types'
import { redact } from '../telemetry/redact.ts'

const MAX_SAMPLES = 5
const SAMPLE_CHARS = 160
const PROMPT_PREVIEW_CHARS = 80

/** What identifies a call in a sample: its command, its file, or its agent type and prompt. */
export function sampleOf(call: RawCall): string {
  if (call.command !== undefined) return call.command
  if (call.file_path !== undefined) return call.file_path
  return `${call.subagent_type ?? call.tool} : ${(call.prompt ?? '').slice(0, PROMPT_PREVIEW_CHARS)}`
}

export function recordHits(stats: Readonly<HitStats>, verdicts: readonly Verdict[], sample: string): HitStats {
  const next: HitStats = { ...stats }
  const clipped = redact(sample).slice(0, SAMPLE_CHARS)
  for (const verdict of verdicts) {
    const previous = next[verdict.ruleId] ?? { mode: verdict.mode, action: verdict.action, count: 0, bypassed: 0, samples: [] }
    next[verdict.ruleId] = {
      mode: verdict.mode,
      action: verdict.action,
      count: previous.count + 1,
      bypassed: previous.bypassed + (verdict.bypassed ? 1 : 0),
      samples: [...previous.samples, clipped].slice(-MAX_SAMPLES),
    }
  }
  return next
}

export function mergeHits(base: Readonly<HitStats>, delta: Readonly<HitStats>): HitStats {
  const merged: HitStats = { ...base }
  for (const [id, added] of Object.entries(delta)) {
    const previous = merged[id]
    merged[id] = previous
      ? {
          mode: added.mode,
          action: added.action,
          count: previous.count + added.count,
          bypassed: previous.bypassed + added.bypassed,
          samples: [...previous.samples, ...added.samples].slice(-MAX_SAMPLES),
        }
      : added
  }
  return merged
}

const cell = (text: string): string => text.replace(/[|`\n]/g, ' ')

export function formatHits(stats: Readonly<HitStats>, errors: readonly string[]): string {
  const rows = Object.entries(stats).sort(([, a], [, b]) => b.count - a.count)
  const table = [
    '| Règle | Mode | Action | Déclenchements | Contournements | Dernier exemple |',
    '|---|---|---|---|---|---|',
    ...rows.map(([id, s]) => `| ${id} | ${s.mode} | ${s.action} | ${s.count} | ${s.bypassed} | \`${cell(s.samples.at(-1) ?? '')}\` |`),
  ]
  if (rows.length === 0) table.push('| aucune | | | 0 | 0 | |')
  const problems = errors.length > 0 ? ['', '**Erreurs de politique**', ...errors.map(error => `- ${error}`)] : []
  return [...table, ...problems].join('\n')
}

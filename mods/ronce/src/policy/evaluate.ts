import type { RawCall, Rule, SessionFacts, Verdict } from '../../types'
import { runBuiltin } from './builtins.ts'
import { normalizeCommand } from './normalize.ts'

/** Commands are matched on their first characters only, so a 1 MB heredoc costs no more than a long command. */
export const MAX_MATCH_CHARS = 20_000

const compiled = new Map<string, RegExp>()

/** Compiled once per process; loadPolicy has already rejected the patterns that do not compile. */
function pattern(source: string): RegExp {
  let regex = compiled.get(source)
  if (!regex) {
    regex = new RegExp(source)
    compiled.set(source, regex)
  }
  return regex
}

const toolsOf = (rule: Rule): readonly string[] => (Array.isArray(rule.tool) ? rule.tool : [rule.tool])

function whenHolds(rule: Rule, facts: SessionFacts): boolean {
  const when = rule.when
  if (!when) return true
  if (when.interactive !== undefined && when.interactive !== facts.isInteractive) return false
  return Object.entries(when.env ?? {}).every(([name, expected]) =>
    expected === null ? facts.env[name] === undefined : facts.env[name] === expected,
  )
}

type Match = { detail?: string; rewrite?: RawCall }

function matchRule(rule: Rule, call: RawCall, normalized: string | undefined, facts: SessionFacts): Match | null {
  if (!toolsOf(rule).includes(call.tool) || !whenHolds(rule, facts)) return null
  if (rule.command !== undefined) {
    const subject = rule.raw ? call.command : normalized
    if (subject === undefined || !pattern(rule.command).test(subject)) return null
  }
  if (rule.unless !== undefined && call.command !== undefined && pattern(rule.unless).test(call.command)) return null
  if (rule.path !== undefined && !pattern(rule.path).test(call.file_path ?? '')) return null
  if (rule.content !== undefined && !pattern(rule.content).test(call.content ?? '')) return null
  if (rule.readWithoutLimit && call.limit !== undefined) return null
  if (rule.subagentType !== undefined && !pattern(rule.subagentType).test(call.subagent_type ?? '')) return null
  if (rule.model !== undefined && call.model !== rule.model) return null
  if (rule.promptLongerThan !== undefined && (call.prompt?.length ?? 0) <= rule.promptLongerThan) return null
  if (rule.builtin === undefined) return {}
  const found = runBuiltin(rule.builtin, call, facts)
  return found.matched ? { detail: found.detail, rewrite: found.rewrite } : null
}

export function evaluate(rules: readonly Rule[], call: RawCall, facts: SessionFacts): Verdict[] {
  const isTooLong = (call.command?.length ?? 0) > MAX_MATCH_CHARS
  const matched: RawCall = isTooLong ? { ...call, command: call.command!.slice(0, MAX_MATCH_CHARS) } : call
  const command = matched.command === undefined ? undefined : normalizeCommand(matched.command)
  const verdicts: Verdict[] = []
  for (const rule of rules) {
    const found = matchRule(rule, matched, command?.normalized, facts)
    if (!found) continue
    const canRewrite = found.rewrite !== undefined && !isTooLong
    verdicts.push({
      ruleId: rule.id,
      action: rule.action,
      mode: rule.mode,
      message: found.detail ? `${rule.message} (${found.detail})` : rule.message,
      bypassed: command?.allowed.includes(rule.id) ?? false,
      ...(canRewrite ? { rewrite: found.rewrite } : {}),
    })
  }
  return verdicts
}

export type Decision = {
  deny?: Verdict
  rewrite?: Verdict
  asks: Verdict[]
  warns: Verdict[]
}

const isEnforced = (verdict: Verdict): boolean => verdict.mode === 'enforce' && !verdict.bypassed

/** What the enforced verdicts require; a deny wins over everything else. */
export function decide(verdicts: readonly Verdict[]): Decision {
  const active = verdicts.filter(isEnforced)
  const deny = active.find(v => v.action === 'deny')
  if (deny) return { deny, asks: [], warns: [] }
  return {
    rewrite: active.find(v => v.action === 'rewrite' && v.rewrite !== undefined),
    asks: active.filter(v => v.action === 'ask'),
    warns: active.filter(v => v.action === 'warn'),
  }
}

import type { BuiltinName, RawCall, SessionFacts } from '../../types'
import { normalizeCommand, stripCdToCwd } from './normalize.ts'

export type BuiltinResult = { matched: false } | { matched: true; detail?: string; rewrite?: RawCall }

/** Extensions that make a path a project file worth reading with a real tool. */
const PROJECT_FILE = /\.(ts|tsx|js|jsx|mjs|cjs|vue|rs|py|go|java|rb|md|ya?ml|json|toml|css|scss|html)\b/
const SCRATCH = /(^|\/)(tmp|scratchpad|scratch-|\.scratch)/
/** Output the command already bounds: a deliberate choice about volume. */
const BOUNDED = /\|\s*(head|tail|wc|grep|jq|sort|uniq|cut|awk)\b/
const HEREDOC_CREATE = /\bcat\s*>\s*\S/
const SED_READ = /^\s*sed\s+-n\b/
const CAT_READ = /^\s*cat\s+(?![<>])/
const NO_MATCH: BuiltinResult = { matched: false }

function projectFileIn(command: string): string | null {
  for (const token of command.split(/\s+/)) {
    const path = token.replace(/^['"]|['"];?$/g, '')
    if (PROJECT_FILE.test(path) && !SCRATCH.test(path)) return path
  }
  return null
}

function shellRead(call: RawCall): BuiltinResult {
  if (!call.command) return NO_MATCH
  const { normalized } = normalizeCommand(call.command)
  if (BOUNDED.test(normalized) || HEREDOC_CREATE.test(normalized)) return NO_MATCH
  if (!SED_READ.test(normalized) && !CAT_READ.test(normalized)) return NO_MATCH
  const path = projectFileIn(normalized)
  return path ? { matched: true, detail: path } : NO_MATCH
}

function heredocCreate(call: RawCall): BuiltinResult {
  if (!call.command) return NO_MATCH
  const { normalized } = normalizeCommand(call.command)
  if (BOUNDED.test(normalized) || !HEREDOC_CREATE.test(normalized)) return NO_MATCH
  const path = projectFileIn(normalized)
  return path ? { matched: true, detail: path } : NO_MATCH
}

function cdCwdNoop(call: RawCall, facts: SessionFacts): BuiltinResult {
  if (!call.command) return NO_MATCH
  const rest = stripCdToCwd(call.command, facts.cwd)
  return rest === null ? NO_MATCH : { matched: true, rewrite: { ...call, command: rest } }
}

const BUILTINS: Record<BuiltinName, (call: RawCall, facts: SessionFacts) => BuiltinResult> = {
  'shell-read': shellRead,
  'heredoc-create': heredocCreate,
  'cd-cwd-noop': cdCwdNoop,
}

export const BUILTIN_NAMES = Object.keys(BUILTINS) as BuiltinName[]

export function runBuiltin(name: BuiltinName, call: RawCall, facts: SessionFacts): BuiltinResult {
  return BUILTINS[name](call, facts)
}

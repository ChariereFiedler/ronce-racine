import type { BuiltinName, RawCall, RuleContext, SessionFacts } from '../../types'
import { issueCreation } from './issue-command.ts'
import { normalizeCommand, stripCdToCwd } from './normalize.ts'
import { ticketProblems } from './ticket.ts'

/** A builtin may soften its rule's action to a warning, never harden it. */
export type BuiltinResult = { matched: false } | { matched: true; detail?: string; rewrite?: RawCall; action?: 'warn' }

/** The context of a call with no project setting and no session history. */
export const EMPTY_CONTEXT: RuleContext = { ticket: null, issuesSearched: false }

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

const NO_TICKET_CONFIG =
  "aucune clé ticket dans .claude/ronce.json : charger le skill de rédaction de tickets du projet s'il en a un, " +
  'sinon ronce-racine:bug-ticket-root-cause pour un bug'

/** An issue created outside the project's ticket form; without a form configured, only a reminder. */
function ticketNeedsSkill(call: RawCall, _facts: SessionFacts, context: RuleContext): BuiltinResult {
  const creation = call.command === undefined ? null : issueCreation(call.command)
  if (!creation) return NO_MATCH
  const { ticket } = context
  if (!ticket) return { matched: true, action: 'warn', detail: NO_TICKET_CONFIG }
  const problems = ticketProblems(creation, call.files, ticket, context.issuesSearched)
  return problems.length === 0 ? NO_MATCH : { matched: true, detail: `charger Skill ${ticket.skill} ; ${problems.join(' ; ')}` }
}

const BUILTINS: Record<BuiltinName, (call: RawCall, facts: SessionFacts, context: RuleContext) => BuiltinResult> = {
  'shell-read': shellRead,
  'heredoc-create': heredocCreate,
  'cd-cwd-noop': cdCwdNoop,
  'ticket-needs-skill': ticketNeedsSkill,
}

export const BUILTIN_NAMES = Object.keys(BUILTINS) as BuiltinName[]

export function runBuiltin(name: BuiltinName, call: RawCall, facts: SessionFacts, context: RuleContext = EMPTY_CONTEXT): BuiltinResult {
  return BUILTINS[name](call, facts, context)
}

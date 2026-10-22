import type { CheckSpec, Example, Features, LoadedPolicy, Mode, PolicyFile, Rule, SessionFacts, ShapingConfig, ToolName } from '../../types'
import { BUILTIN_NAMES } from './builtins.ts'
import { DEFAULT_FEATURES, DEFAULT_SHAPING, DEFAULT_TELEMETRY } from './defaults.ts'
import { evaluate } from './evaluate.ts'

const TOOLS: readonly string[] = ['Bash', 'Edit', 'Write', 'Read', 'Agent'] satisfies ToolName[]
const ACTIONS: readonly string[] = ['deny', 'ask', 'rewrite', 'warn']
const MODES: readonly string[] = ['shadow', 'enforce'] satisfies Mode[]
const PATTERN_FIELDS = ['command', 'unless', 'path', 'content', 'subagentType'] as const
const ID = /^[a-z0-9-]+$/
const EXAMPLE_PREVIEW_CHARS = 80

/** The session the examples are replayed in: interactive, in /repo, with no variable set. */
export const EXAMPLE_FACTS: SessionFacts = { cwd: '/repo', env: {}, isInteractive: true }

const toolsOf = (rule: Rule): unknown[] => (Array.isArray(rule.tool) ? rule.tool : [rule.tool])

function hasCriterion(rule: Rule): boolean {
  return (
    rule.command !== undefined || rule.path !== undefined || rule.content !== undefined ||
    rule.subagentType !== undefined || rule.model !== undefined || rule.promptLongerThan !== undefined ||
    rule.readWithoutLimit === true || rule.builtin !== undefined
  )
}

function shapeErrors(rule: Rule): string[] {
  const where = `règle ${typeof rule.id === 'string' ? rule.id : '(sans id)'}`
  const errors: string[] = []
  if (typeof rule.id !== 'string' || !ID.test(rule.id)) errors.push(`${where} : id invalide`)
  const tools = toolsOf(rule)
  if (tools.length === 0 || tools.some(tool => typeof tool !== 'string' || !TOOLS.includes(tool))) errors.push(`${where} : outil inconnu`)
  if (!ACTIONS.includes(rule.action)) errors.push(`${where} : action inconnue`)
  if (!MODES.includes(rule.mode)) errors.push(`${where} : mode inconnu`)
  if (typeof rule.message !== 'string' || rule.message.trim() === '') errors.push(`${where} : message vide`)
  if (rule.builtin !== undefined && !BUILTIN_NAMES.includes(rule.builtin)) errors.push(`${where} : builtin inconnu`)
  if (rule.action === 'rewrite' && rule.builtin === undefined) errors.push(`${where} : seul un builtin peut réécrire`)
  if (!hasCriterion(rule)) errors.push(`${where} : aucun critère, elle viserait tous les appels`)
  for (const field of PATTERN_FIELDS) {
    const source = rule[field]
    if (source === undefined) continue
    try {
      new RegExp(source)
    } catch (error) {
      errors.push(`${where} : regex ${field} invalide (${error instanceof Error ? error.message : String(error)})`)
    }
  }
  return errors
}

/** Examples check what the rule matches, not the session it applies to: `when` is left out. */
function exampleErrors(rule: Rule): string[] {
  if (!rule.examples) return []
  const unconditional: Rule = { ...rule, when: undefined }
  const firstTool = toolsOf(rule)[0] as ToolName
  const matches = (example: Example): boolean =>
    evaluate([unconditional], { ...example, tool: example.tool ?? firstTool }, EXAMPLE_FACTS).length > 0
  const preview = (example: Example): string => JSON.stringify(example).slice(0, EXAMPLE_PREVIEW_CHARS)
  return [
    ...rule.examples.match.filter(e => !matches(e)).map(e => `règle ${rule.id} : l'exemple ${preview(e)} devrait matcher`),
    ...rule.examples.pass.filter(e => matches(e)).map(e => `règle ${rule.id} : l'exemple ${preview(e)} ne devrait pas matcher`),
  ]
}

/** A rule is kept only when it is well formed, unique and passes its own examples. */
export function checkRules(rules: readonly Rule[]): { valid: Rule[]; errors: string[] } {
  const valid: Rule[] = []
  const errors: string[] = []
  const seen = new Set<string>()
  for (const rule of rules) {
    const shape = shapeErrors(rule)
    if (seen.has(rule.id)) shape.push(`règle ${rule.id} : id en double`)
    const problems = shape.length > 0 ? shape : exampleErrors(rule)
    seen.add(rule.id)
    if (problems.length > 0) errors.push(...problems)
    else valid.push(rule)
  }
  return { valid, errors }
}

function parse(fileText: string | null): { file: PolicyFile; errors: string[] } {
  const empty: PolicyFile = { version: 1 }
  if (fileText === null) return { file: empty, errors: [] }
  let parsed: unknown
  try {
    parsed = JSON.parse(fileText)
  } catch (error) {
    return { file: empty, errors: [`politique : JSON invalide, fichier ignoré (${error instanceof Error ? error.message : String(error)})`] }
  }
  if ((parsed as PolicyFile | null)?.version !== 1) return { file: empty, errors: ['politique : version 1 attendue, fichier ignoré'] }
  return { file: parsed as PolicyFile, errors: [] }
}

function shapingOf(file: PolicyFile): { shaping: ShapingConfig; errors: string[] } {
  const shaping = { ...DEFAULT_SHAPING, ...file.shaping }
  if (MODES.includes(shaping.mode)) return { shaping, errors: [] }
  return { shaping: { ...shaping, mode: DEFAULT_SHAPING.mode }, errors: [`politique : shaping.mode « ${shaping.mode} » inconnu, ${DEFAULT_SHAPING.mode} retenu`] }
}

const compiles = (pattern: string): boolean => {
  try {
    new RegExp(pattern)
    return true
  } catch {
    // An invalid pattern is reported by the caller, which drops the entry that holds it.
    return false
  }
}

/** A key left out keeps the default; `null` turns a feature off. */
function featuresOf(file: PolicyFile): { features: Features; errors: string[] } {
  const errors: string[] = []
  const hints = (file.skillHints ?? DEFAULT_FEATURES.skillHints).filter(hint => {
    if (compiles(hint.pattern)) return true
    errors.push(`politique : skillHints « ${hint.skill} » a une regex invalide, rappel ignoré`)
    return false
  })
  const memo = file.memo === null ? null : { ...DEFAULT_FEATURES.memo!, ...file.memo }
  if (memo && !compiles(memo.ticketPattern)) {
    errors.push('politique : memo.ticketPattern invalide, motif par défaut retenu')
    memo.ticketPattern = DEFAULT_FEATURES.memo!.ticketPattern
  }
  const validChecks = (kind: 'onEdit' | 'background'): CheckSpec[] =>
    (file.checks?.[kind] ?? DEFAULT_FEATURES.checks[kind]).filter(check => {
      const patterns = [
        check.match, check.unless, check.findingWhen, check.keepLinesMatching, check.alsoReportOnFailure, check.group, check.onlyIfFilesContain,
      ]
      if (patterns.every(pattern => pattern === undefined || compiles(pattern))) return true
      errors.push(`politique : checks.${kind} « ${check.id} » a une regex invalide, vérification ignorée`)
      return false
    })
  return {
    features: {
      worktree: file.worktree === undefined ? DEFAULT_FEATURES.worktree : file.worktree,
      freshness: file.freshness ?? DEFAULT_FEATURES.freshness,
      agentBudget: file.agentBudget ?? DEFAULT_FEATURES.agentBudget,
      memo,
      skillHints: hints,
      skillCatalog: file.skillCatalog === null ? null : { ...DEFAULT_FEATURES.skillCatalog!, ...file.skillCatalog },
      band: file.band ?? DEFAULT_FEATURES.band,
      checks: {
        onEdit: validChecks('onEdit'),
        background: validChecks('background'),
        busyPattern: file.checks?.busyPattern ?? DEFAULT_FEATURES.checks.busyPattern,
        maxWakes: file.checks?.maxWakes ?? DEFAULT_FEATURES.checks.maxWakes,
      },
    },
    errors,
  }
}

export function loadPolicy(defaults: readonly Rule[], fileText: string | null): LoadedPolicy {
  const { file, errors } = parse(fileText)
  const own = file.rules ?? []
  const ownIds = new Set(own.map(rule => rule.id))
  const disabled = new Set(file.disable ?? [])
  const merged = [...defaults.filter(rule => !disabled.has(rule.id) && !ownIds.has(rule.id)), ...own]
  const withModes = merged.map(rule => {
    const mode = file.modes?.[rule.id]
    return mode ? { ...rule, mode } : rule
  })
  const checked = checkRules(withModes)
  const { shaping, errors: shapingErrors } = shapingOf(file)
  const { features, errors: featureErrors } = featuresOf(file)
  return {
    rules: checked.valid,
    shaping,
    telemetry: file.telemetry === null ? null : { ...DEFAULT_TELEMETRY, ...file.telemetry },
    features,
    errors: [...errors, ...shapingErrors, ...featureErrors, ...checked.errors],
  }
}

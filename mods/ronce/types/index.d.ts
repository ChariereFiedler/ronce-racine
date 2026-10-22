export type ToolName = 'Bash' | 'Edit' | 'Write' | 'Read' | 'Agent'
export type Action = 'deny' | 'ask' | 'rewrite' | 'warn'
export type Mode = 'shadow' | 'enforce'
export type BuiltinName = 'shell-read' | 'heredoc-create' | 'cd-cwd-noop'

/** A tool call reduced to the fields the rules read. */
export type RawCall = {
  tool: string
  command?: string
  file_path?: string
  /** Write's content, or Edit's new_string. */
  content?: string
  limit?: number
  prompt?: string
  subagent_type?: string
  model?: string
}

/** A call a rule's examples replay; `tool` defaults to the rule's first tool. */
export type Example = Omit<RawCall, 'tool'> & { tool?: ToolName }

export type RuleWhen = {
  /** A string requires that value; null requires the variable to be unset. */
  env?: Record<string, string | null>
  interactive?: boolean
}

export type Rule = {
  id: string
  source?: string
  tool: ToolName | ToolName[]
  command?: string
  /** Match `command` against the raw command instead of the normalized one (for rules about the prefix itself). */
  raw?: true
  unless?: string
  path?: string
  content?: string
  readWithoutLimit?: true
  subagentType?: string
  model?: string
  promptLongerThan?: number
  builtin?: BuiltinName
  when?: RuleWhen
  action: Action
  mode: Mode
  message: string
  examples?: { match: Example[]; pass: Example[] }
}

export type ShapingConfig = { mode: Mode; maxChars: number; headLines: number; tailLines: number; dir: string }
export type TelemetryConfig = { dir: string }

/** Files a linked worktree gets as links to the main checkout's, so it runs like the main one. */
export type WorktreeConfig = { links: string[] }
/** Warn when the local copy of a branch lags behind the remote one. */
export type FreshnessConfig = { remote: string; branch: string }
export type MergeRequestBudget = {
  cap: number
  project: string
  gitlabUrl: string
  /** File holding the token, relative to the main checkout (a `.env`), and the variable to read in it. */
  tokenFile: string
  tokenVar: string
  /** MRs carrying one of these labels wait on a person and do not count against the cap. */
  humanGatedLabels: string[]
}
/** Worktrees are the main checkout's siblings named `<repo>-wt-*`; `baseRef` decides which are empty. */
export type WorktreeBudget = { cap: number; emptyAgeMinutes: number; baseRef: string }
/** Caps on what dev subagents may open; agent types that only read are exempt. */
export type AgentBudgetConfig = {
  exempt: string[]
  cacheMs: number
  mergeRequests?: MergeRequestBudget
  worktrees?: WorktreeBudget
}
/** The note appended after a compaction: branch, ticket, last intent, stale decisions file. */
export type MemoConfig = { ticketPattern: string; decisionsFile?: string; staleDays: number }
/** A skill suggested when a prompt matches `pattern` (case-insensitive). */
export type SkillHint = { pattern: string; skill: string; reason: string; note?: string }
/**
 * A folder of skills (`<name>/SKILL.md`) whose triggers are matched against each prompt. `dir` is
 * relative to the repository root, or starts with `{pluginRoot}` or `~`; `namespace` prefixes the
 * suggested names, as a plugin's skills are invoked.
 */
export type SkillCatalogSource = { dir: string; namespace?: string }
/** Skills suggested from their own descriptions, when no `skillHints` entry matched. */
export type SkillCatalogConfig = { sources: SkillCatalogSource[]; max: number }
/** A skill of the catalog: the quoted triggers of its description and the long words of its name. */
export type CatalogSkill = { name: string; namespace?: string; triggers: string[] }

/**
 * A command the mod runs on the host after an edit (`onEdit`) or after a turn (`background`).
 * In `run`, `{file}` is the absolute path, `{rel}` the path from the repository root, `{files}` every
 * matched file (one argument each) and `{group}` the value `group` captured.
 */
export type CheckSpec = {
  id: string
  title: string
  /** Regex on the path from the repository root. */
  match: string
  unless?: string
  run: string[]
  /** Directory to run in, from the repository root; `package` is the nearest ancestor holding `packageMarker`. */
  cwd?: string
  packageMarker?: string
  /** Paths, from the run directory, one of which must exist; the check is skipped otherwise. */
  requiresAny?: string[]
  /** Pipes `{"tool_input":{"file_path":<file>}}` to the command, as a settings hook would get it. */
  stdin?: 'hook-input'
  /** A file whose variables are passed to the command, from the repository root. */
  envFile?: string
  timeoutMs: number
  /** Regex the output must contain to be a finding; absent, a non-zero exit is one. */
  findingWhen?: string
  /** Keep only the output lines that match. */
  keepLinesMatching?: string
  /** Keep only the output lines that mention a matched file; then any such line is a finding. */
  onlyLinesMentioningFiles?: boolean
  /** Also report lines matching this when the command fails, wherever they point. */
  alsoReportOnFailure?: string
  maxLines: number
  /** Background only: run only when one of the matched files holds a line matching this regex. */
  onlyIfFilesContain?: string
  /** Background only: one run per value this regex (one capture) takes on the matched paths. */
  group?: string
  /** Background only: extra arguments when a file (from the repository root, `{group}` allowed) has a line matching `pattern`. */
  addArgsIfFileMatches?: { file: string; pattern: string; args: string[] }
  /** Background only: wait for the next turn while a process matching `busyPattern` runs. */
  deferIfBusy?: boolean
  /** Background only: skip unless the host:port of a URL held in an env file answers. */
  skipUnlessReachable?: { envFile: string; envVar: string; defaultPort: number }
}

export type ChecksConfig = {
  onEdit: CheckSpec[]
  background: CheckSpec[]
  /** `pgrep -f` pattern of the heavy processes a deferred check waits for. */
  busyPattern: string
  /** Background failures that start a turn in a row; past it they are only appended. */
  maxWakes: number
}

export type Features = {
  worktree: WorktreeConfig | null
  freshness: FreshnessConfig | null
  agentBudget: AgentBudgetConfig | null
  memo: MemoConfig | null
  skillHints: SkillHint[]
  skillCatalog: SkillCatalogConfig | null
  band: boolean
  checks: ChecksConfig
}

export type PolicyFile = {
  version: 1
  rules?: Rule[]
  disable?: string[]
  modes?: Record<string, Mode>
  shaping?: Partial<ShapingConfig>
  telemetry?: Partial<TelemetryConfig> | null
  worktree?: WorktreeConfig | null
  freshness?: FreshnessConfig | null
  agentBudget?: AgentBudgetConfig | null
  memo?: Partial<MemoConfig> | null
  skillHints?: SkillHint[]
  skillCatalog?: Partial<SkillCatalogConfig> | null
  band?: boolean
  /** A list given here replaces the engine's list of the same kind. */
  checks?: Partial<ChecksConfig>
}

export type LoadedPolicy = {
  rules: Rule[]
  shaping: ShapingConfig
  telemetry: TelemetryConfig | null
  features: Features
  errors: string[]
}

/** What the band above the prompt shows. */
export type BandStatus = {
  project: string
  branch?: string
  contextPercent?: number
  costUsd?: number
  worktrees?: { count: number; cap: number }
  mergeRequests?: { count: number; cap: number }
}

/** The last budget reading, cached for `cacheMs`. */
export type BudgetSnapshot = {
  at: number
  mergeRequests?: { count: number; cap: number; iids: number[] }
  worktrees?: { count: number; cap: number; names: string[] }
}

export type SessionFacts = {
  cwd: string
  env: Record<string, string | undefined>
  isInteractive: boolean
  /** The checkout the session runs in and the main one; equal outside a linked worktree, absent outside git. */
  roots?: { worktreeRoot: string; mainRoot: string }
}

export type Verdict = {
  ruleId: string
  action: Action
  mode: Mode
  message: string
  bypassed: boolean
  rewrite?: RawCall
}

export type RuleHitRef = { id: string; mode: Mode; action: Action; bypassed: boolean }

export type ToolEvent = {
  type: 'tool'
  ts: string
  sessionId: string
  projectDir: string
  agentId?: string
  tool: string
  success: boolean
  denied: boolean
  durationMs: number
  command?: string
  normalized?: string
  file_path?: string
  subagent_type?: string
  rules: RuleHitRef[]
  shaping?: { originalChars: number; keptChars: number; applied: boolean }
}

export type TurnEvent = {
  type: 'turn'
  ts: string
  sessionId: string
  projectDir: string
  costUsd?: number
  contextPercent?: number
}

export type TelemetryEvent = ToolEvent | TurnEvent

export type HitStat = { mode: Mode; action: Action; count: number; bypassed: number; samples: string[] }
export type HitStats = Record<string, HitStat>

declare module 'claude-code' {
  interface PluginState {
    ronce: {
      policy: LoadedPolicy | null
      facts: SessionFacts | null
      telemetry: TelemetryEvent[]
      hits: HitStats
      flushSeq: number
      lastIntent: string | null
      budget: BudgetSnapshot | null
      band: BandStatus | null
      /** The changed files and their times when the background checks last ran. */
      checkScope: string | null
      wakes: number
      /** The skills of `skillCatalog`; null until read, at the session start or the first prompt. */
      catalog: CatalogSkill[] | null
    }
  }
}

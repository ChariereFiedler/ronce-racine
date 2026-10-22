import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ToolCallResult } from 'claude-code'
import type {
  AgentBudgetConfig,
  BandStatus,
  BudgetSnapshot,
  CatalogSkill,
  CheckSpec,
  FreshnessConfig,
  HitStats,
  LoadedPolicy,
  MemoConfig,
  MergeRequestBudget,
  SessionFacts,
  SkillCatalogSource,
  ToolEvent,
  WorktreeBudget,
} from '../types'
import { backgroundRuns, changedPaths, checksForPath, expandRun, findingOf, parseEnv, reachTarget, reportText, scopeKey } from '../src/checks/plan.ts'
import { activeWorktrees, blockingMergeRequests, budgetDenial, isExempt } from '../src/features/budget.ts'
import type { OpenMergeRequest, WorktreeState } from '../src/features/budget.ts'
import { envValue } from '../src/features/env-file.ts'
import { freshnessNote } from '../src/features/freshness.ts'
import { memoText, ticketFrom } from '../src/features/memo.ts'
import { catalogDir, catalogMatches, catalogText, mergeCatalogs, parseSkill } from '../src/features/skill-catalog.ts'
import { hintFor, hintText } from '../src/features/skill-hints.ts'
import { linksToCreate } from '../src/features/worktree-env.ts'
import { DEFAULT_RULES } from '../src/policy/defaults.ts'
import { decide, evaluate } from '../src/policy/evaluate.ts'
import { formatHits, mergeHits, recordHits, sampleOf } from '../src/policy/hits.ts'
import { loadPolicy } from '../src/policy/load.ts'
import { policyCandidates } from '../src/policy/locate.ts'
import { allowedRuleIds } from '../src/policy/normalize.ts'
import { baseName, expandHome, parentDir } from '../src/policy/paths.ts'
import { toRawCall } from '../src/policy/raw-call.ts'
import { fullOutputPath, planShaping } from '../src/shaping/truncate.ts'
import { appendCapped, batchPath, toJsonl, toolEvent, turnEvent } from '../src/telemetry/event.ts'
import type { ToolOutcome } from '../src/telemetry/event.ts'
import { bandLine, projectTitle } from '../src/ui/band.ts'

// Declared here, not imported: the engine lists the values a module reads and writes from the atoms of its own file.
const policyState = atom({ plugin: 'ronce', key: 'policy' } as const, null)
const factsState = atom({ plugin: 'ronce', key: 'facts' } as const, null)
const telemetryState = atom({ plugin: 'ronce', key: 'telemetry' } as const, [])
const hitsState = atom({ plugin: 'ronce', key: 'hits' } as const, {})
const flushSeqState = atom({ plugin: 'ronce', key: 'flushSeq' } as const, 0)
const lastIntentState = atom({ plugin: 'ronce', key: 'lastIntent' } as const, null)
const budgetState = atom({ plugin: 'ronce', key: 'budget' } as const, null)
const bandState = atom({ plugin: 'ronce', key: 'band' } as const, null)
const checkScopeState = atom({ plugin: 'ronce', key: 'checkScope' } as const, null)
const wakesState = atom({ plugin: 'ronce', key: 'wakes' } as const, 0)
const catalogState = atom({ plugin: 'ronce', key: 'catalog' } as const, null)

const HITS_STORE_KEY = 'hits'
const BAND_REFRESH_MS = 60_000
const AGENT_BUDGET_RULE = 'agent-budget'
const GIT_TIMEOUT_MS = 10_000
const FETCH_TIMEOUT_MS = 8_000
const MINUTE_MS = 60_000
const DAY_MS = 86_400_000
const WORKTREE_INFIX = '-wt-'
const PROBE_TIMEOUT_MS = 2_000
const BUSY_PROBE_TIMEOUT_MS = 5_000
// A module variable on purpose: a reload starts with no background run, which is the truth.
let isBackgroundRunning = false

// The engine follows `$` only into functions declared in this file, never across an import:
// every function below that touches `$` lives here, and the logic it calls lives in src/.

/** `git -C <cwd> <args>`, its trimmed output, or null when git fails or cannot start. */
async function gitOut($: EngineInterface, cwd: string, args: readonly string[], timeoutMs = GIT_TIMEOUT_MS): Promise<string | null> {
  try {
    const run = await $.process.run(['git', '-C', cwd, ...args], { timeoutMs })
    return run.exitCode === 0 ? run.stdout.trim() : null
  } catch (error) {
    $.ui.log(`ronce : git ${args.join(' ')} n'a pas abouti (${String(error)})`, { to: 'debug' })
    return null
  }
}

async function repoRoots($: EngineInterface, cwd: string): Promise<SessionFacts['roots']> {
  const worktreeRoot = await gitOut($, cwd, ['rev-parse', '--show-toplevel'])
  const commonDir = await gitOut($, cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir'])
  if (!worktreeRoot || !commonDir) return undefined
  return { worktreeRoot, mainRoot: commonDir.replace(/\/\.git\/?$/, '') }
}

/** Links the files a linked worktree misses, in the session's worktree and in `.claude/worktrees/*`. */
async function linkWorktreeFiles($: EngineInterface, roots: NonNullable<SessionFacts['roots']>, names: readonly string[]): Promise<void> {
  const agentWorktrees = `${roots.mainRoot}/.claude/worktrees`
  const nested = (await $.fs.exists(agentWorktrees))
    ? (await $.fs.list(agentWorktrees)).filter(entry => entry.kind === 'dir').map(entry => `${agentWorktrees}/${entry.name}`)
    : []
  for (const worktreeRoot of [roots.worktreeRoot, ...nested]) {
    const existing = new Set<string>()
    for (const name of names) {
      for (const path of [`${worktreeRoot}/${name}`, `${roots.mainRoot}/${name}`]) if (await $.fs.exists(path)) existing.add(path)
    }
    for (const { link, target } of linksToCreate({ worktreeRoot, mainRoot: roots.mainRoot, names, exists: p => existing.has(p) })) {
      await $.process.run(['ln', '-s', target, link])
    }
  }
}

/** Fetches the base branch and, when the local copy lags, tells the model before it starts. */
async function warnIfStale($: EngineInterface, cwd: string, freshness: FreshnessConfig): Promise<void> {
  const { remote, branch: base } = freshness
  await gitOut($, cwd, ['fetch', '-q', remote, base], FETCH_TIMEOUT_MS)
  const behind = Number(await gitOut($, cwd, ['rev-list', '--count', `${base}..${remote}/${base}`]))
  const ahead = Number((await gitOut($, cwd, ['rev-list', '--count', `${remote}/${base}..${base}`])) ?? 0)
  const branch = (await gitOut($, cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])) ?? '?'
  const note = freshnessNote({ behind, ahead, branch, remote, base })
  if (!note) return
  $.ui.toast(note.split('\n')[0]!)
  await $.session.append({ message: { type: 'user', content: [{ type: 'text', text: note }] } })
}

async function mergeRequestBudget($: EngineInterface, budget: MergeRequestBudget, mainRoot: string): Promise<BudgetSnapshot['mergeRequests']> {
  const tokenFile = `${mainRoot}/${budget.tokenFile}`
  const token = (await $.fs.exists(tokenFile)) ? envValue(await $.fs.read(tokenFile), budget.tokenVar) : null
  if (!token) return undefined
  const url = `${budget.gitlabUrl}/api/v4/projects/${encodeURIComponent(budget.project)}/merge_requests?state=opened&per_page=100`
  const response = await $.http.fetch(url, { headers: { 'PRIVATE-TOKEN': token } })
  if (!response.ok) return undefined
  const open = JSON.parse(response.text) as OpenMergeRequest[]
  const blocking = blockingMergeRequests(open.map(mr => ({ ...mr, labels: mr.labels ?? [] })), budget.humanGatedLabels)
  return { count: blocking.length, cap: budget.cap, iids: blocking.map(mr => mr.iid) }
}

async function worktreeState($: EngineInterface, path: string, name: string, baseRef: string, now: number): Promise<WorktreeState> {
  if (!(await $.fs.exists(`${path}/.git`))) return { name, isRepo: false, commitsAhead: null, hasChanges: null, ageMinutes: 0 }
  const ahead = await gitOut($, path, ['rev-list', '--count', 'HEAD', `^${baseRef}`])
  const status = await gitOut($, path, ['status', '--porcelain'])
  const modifiedAt = (await $.fs.stat(`${path}/.git`)).mtimeMs
  return {
    name,
    isRepo: true,
    commitsAhead: ahead === null ? null : Number(ahead),
    hasChanges: status === null ? null : status.length > 0,
    ageMinutes: (now - modifiedAt) / MINUTE_MS,
  }
}

async function worktreeBudget($: EngineInterface, budget: WorktreeBudget, mainRoot: string, now: number): Promise<BudgetSnapshot['worktrees']> {
  const parent = parentDir(mainRoot)
  const prefix = `${baseName(mainRoot)}${WORKTREE_INFIX}`
  const entries = (await $.fs.list(parent)).filter(entry => entry.name.startsWith(prefix) && (entry.kind === 'dir' || entry.isLink))
  const states: WorktreeState[] = []
  for (const entry of entries) states.push(await worktreeState($, `${parent}/${entry.name}`, entry.name, budget.baseRef, now))
  const active = activeWorktrees(states, budget.emptyAgeMinutes)
  return { count: active.length, cap: budget.cap, names: active.map(w => w.name) }
}

/** The budget reading, served from the session's cache while it is younger than `cacheMs`. */
async function readBudget($: EngineInterface, budget: AgentBudgetConfig, mainRoot: string): Promise<BudgetSnapshot> {
  const now = await $.clock.now()
  const cached = await read($, budgetState)
  if (cached && now - cached.at < budget.cacheMs) return cached
  const snapshot: BudgetSnapshot = { at: now }
  if (budget.mergeRequests) snapshot.mergeRequests = await mergeRequestBudget($, budget.mergeRequests, mainRoot)
  if (budget.worktrees) snapshot.worktrees = await worktreeBudget($, budget.worktrees, mainRoot, now)
  await update($, budgetState, () => snapshot)
  return snapshot
}

async function appendMemo($: EngineInterface, facts: SessionFacts, memo: MemoConfig, lastIntent: string | null): Promise<void> {
  const branch = (await gitOut($, facts.cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])) ?? '?'
  const decisionsPath = memo.decisionsFile && facts.roots ? `${facts.roots.worktreeRoot}/${memo.decisionsFile}` : null
  let decisions: { file: string; ageDays: number; staleDays: number } | undefined
  if (decisionsPath && memo.decisionsFile && (await $.fs.exists(decisionsPath))) {
    const ageDays = Math.floor(((await $.clock.now()) - (await $.fs.stat(decisionsPath)).mtimeMs) / DAY_MS)
    decisions = { file: memo.decisionsFile, ageDays, staleDays: memo.staleDays }
  }
  const text = memoText({ branch, ticket: ticketFrom(branch, memo.ticketPattern), lastIntent, decisions })
  await $.session.append({ message: { type: 'user', content: [{ type: 'text', text }] } })
}

/** The nearest directory from `dir` up to `root` that holds `marker`; null when none does. */
async function packageDir($: EngineInterface, dir: string, marker: string, root: string): Promise<string | null> {
  for (let current = dir; current.startsWith(root); current = parentDir(current)) {
    if (await $.fs.exists(`${current}/${marker}`)) return current
    if (current === root) break
  }
  return null
}

async function runDirectory($: EngineInterface, spec: CheckSpec, root: string, firstFile: string): Promise<string | null> {
  if (spec.cwd !== 'package') return spec.cwd ? `${root}/${spec.cwd}` : root
  return spec.packageMarker ? packageDir($, parentDir(firstFile), spec.packageMarker, root) : null
}

/** Runs one check and returns what the model should read of it; a tool that is missing or hangs counts as no finding. */
async function runCheck(
  $: EngineInterface,
  spec: CheckSpec,
  context: { root: string; cwd: string; argv: string[]; mentions: string[]; facts: SessionFacts; hookInputFile?: string },
): Promise<string | null> {
  if (spec.requiresAny) {
    let isAvailable = false
    for (const path of spec.requiresAny) if (await $.fs.exists(`${context.cwd}/${path}`)) isAvailable = true
    if (!isAvailable) return null
  }
  const env = spec.envFile
    ? { ...parseEnv(await $.fs.read(`${context.root}/${spec.envFile}`)), PATH: context.facts.env.PATH ?? '', HOME: context.facts.env.HOME ?? '' }
    : undefined
  const stdin = spec.stdin === 'hook-input' ? JSON.stringify({ tool_input: { file_path: context.hookInputFile } }) : undefined
  try {
    const run = await $.process.run(context.argv, { cwd: context.cwd, timeoutMs: spec.timeoutMs, ...(env ? { env } : {}), ...(stdin ? { stdin } : {}) })
    return findingOf(spec, run.exitCode, `${run.stdout}\n${run.stderr}`, context.mentions)
  } catch (error) {
    $.ui.log(`ronce : vérification ${spec.id} non lancée (${String(error)})`, { to: 'debug' })
    return null
  }
}

/** The findings of the checks an edited file calls for, worded for the model's context. */
async function runEditChecks($: EngineInterface, policy: LoadedPolicy, facts: SessionFacts, file: string): Promise<string[]> {
  const root = facts.roots?.worktreeRoot
  if (!root || !file.startsWith(`${root}/`)) return []
  const rel = file.slice(root.length + 1)
  const findings: string[] = []
  for (const spec of checksForPath(policy.features.checks.onEdit, rel)) {
    const cwd = await runDirectory($, spec, root, file)
    if (!cwd) continue
    const argv = expandRun(spec.run, { file, rel, files: [file] })
    const finding = await runCheck($, spec, { root, cwd, argv, mentions: [file, rel], facts, hookInputFile: file })
    if (finding) findings.push(`ronce/check:${spec.id} : ${spec.title}\n${finding}`)
  }
  return findings
}

async function isMachineBusy($: EngineInterface, pattern: string): Promise<boolean> {
  try {
    return (await $.process.run(['pgrep', '-f', pattern], { timeoutMs: BUSY_PROBE_TIMEOUT_MS })).exitCode === 0
  } catch (error) {
    $.ui.log(`ronce : pgrep impossible (${String(error)}), machine supposée libre`, { to: 'debug' })
    return false
  }
}

async function isReachable($: EngineInterface, root: string, probe: NonNullable<CheckSpec['skipUnlessReachable']>): Promise<boolean> {
  const envPath = `${root}/${probe.envFile}`
  if (!(await $.fs.exists(envPath))) return false
  const url = parseEnv(await $.fs.read(envPath))[probe.envVar]
  const target = url ? reachTarget(url, probe.defaultPort) : null
  if (!target) return false
  try {
    const run = await $.process.run(['bash', '-c', `exec 3<>/dev/tcp/${target.host}/${target.port}`], { timeoutMs: PROBE_TIMEOUT_MS })
    return run.exitCode === 0
  } catch (error) {
    $.ui.log(`ronce : ${target.host}:${target.port} injoignable (${String(error)})`, { to: 'debug' })
    return false
  }
}

async function changedScope($: EngineInterface, root: string): Promise<{ changed: string[]; key: string }> {
  const changed = changedPaths((await gitOut($, root, ['status', '--porcelain', '-uall'])) ?? '')
  const entries: { path: string; mtimeMs: number }[] = []
  for (const path of changed) {
    if (await $.fs.exists(`${root}/${path}`)) entries.push({ path, mtimeMs: (await $.fs.stat(`${root}/${path}`)).mtimeMs })
  }
  return { changed, key: scopeKey(entries) }
}

/** The background checks of the changed files, once per state of those files; a failure reaches the model. */
async function runBackgroundChecks($: EngineInterface): Promise<void> {
  const { policy, facts } = await ensureSession($)
  const root = facts.roots?.worktreeRoot
  const config = policy.features.checks
  if (!root || config.background.length === 0) return
  const { changed, key } = await changedScope($, root)
  if (changed.length === 0 || key === (await read($, checkScopeState))) return
  const failures: { title: string; body: string }[] = []
  // Only the files a content-gated check looks at are read; one that cannot be read counts as empty.
  const contents = new Map<string, string>()
  const gated = config.background.filter(spec => spec.onlyIfFilesContain)
  for (const rel of changed.filter(path => checksForPath(gated, path).length > 0)) {
    try {
      contents.set(rel, await $.fs.read(`${root}/${rel}`))
    } catch (error) {
      $.ui.log(`ronce : ${rel} illisible pour les vérifications (${String(error)})`, { to: 'debug' })
    }
  }
  for (const run of backgroundRuns(config.background, changed, rel => contents.get(rel))) {
    const { spec } = run
    // Deferred: the scope is not recorded, so the next turn tries again.
    if (spec.deferIfBusy && (await isMachineBusy($, config.busyPattern))) return
    if (spec.skipUnlessReachable && !(await isReachable($, root, spec.skipUnlessReachable))) continue
    const files = run.files.map(rel => `${root}/${rel}`)
    const cwd = await runDirectory($, spec, root, files[0]!)
    if (!cwd) continue
    const argv = expandRun(spec.run, { file: files[0], rel: run.files[0], group: run.group, files })
    const extra = spec.addArgsIfFileMatches
    if (extra) {
      const path = `${root}/${extra.file.replaceAll('{group}', run.group ?? '')}`
      if ((await $.fs.exists(path)) && new RegExp(extra.pattern, 'm').test(await $.fs.read(path))) argv.push(...extra.args)
    }
    const fromCwd = cwd === root ? run.files : run.files.map(rel => rel.replace(`${cwd.slice(root.length + 1)}/`, ''))
    const finding = await runCheck($, spec, { root, cwd, argv, mentions: [...run.files, ...fromCwd], facts })
    if (finding) failures.push({ title: run.group ? `${spec.title} : ${run.group}` : spec.title, body: finding })
  }
  await update($, checkScopeState, () => key)
  if (failures.length === 0) return
  const text = reportText(failures)
  $.ui.toast(`ronce : ${failures.length} vérification(s) en échec sur le scope modifié`)
  const wakes = await read($, wakesState)
  if (wakes < config.maxWakes) {
    await update($, wakesState, n => n + 1)
    await $.prompt.submit({ text })
  } else {
    // Past the cap the session is not woken again: the report waits in the conversation.
    await $.session.append({ message: { type: 'user', content: [{ type: 'text', text }] } })
  }
}

/** What the band shows; budgets come from the cached reading, refreshed when stale. */
async function refreshBand($: EngineInterface, policy: LoadedPolicy, facts: SessionFacts): Promise<void> {
  const usage = await $.session.usage()
  const root = facts.roots?.mainRoot ?? facts.cwd
  const status: BandStatus = {
    project: projectTitle(baseName(root)),
    branch: (await gitOut($, facts.cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])) ?? undefined,
    contextPercent: usage.context.percent,
    costUsd: usage.cost?.usd,
  }
  const budget = policy.features.agentBudget
  if (budget && facts.roots) {
    const reading = await readBudget($, budget, facts.roots.mainRoot)
    if (reading.worktrees) status.worktrees = { count: reading.worktrees.count, cap: reading.worktrees.cap }
    if (reading.mergeRequests) status.mergeRequests = { count: reading.mergeRequests.count, cap: reading.mergeRequests.cap }
  }
  await update($, bandState, () => status)
}
const GUARD_ERROR_RULE = 'guard-error'
const GUARD_ERROR_MESSAGE =
  `ronce/${GUARD_ERROR_RULE} : le garde-fou a échoué sur cette commande, refusée par prudence (détail dans le journal de debug). ` +
  `Pour passer outre une fois : ajouter « # ronce:allow ${GUARD_ERROR_RULE} » à la commande.`

type Session = { policy: LoadedPolicy; facts: SessionFacts }

async function readPolicyText($: EngineInterface, cwd: string): Promise<string | null> {
  for (const path of policyCandidates(cwd)) {
    if (await $.fs.exists(path)) return $.fs.read(path)
  }
  return null
}

/** The project's policy, or the defaults alone with the reason when the file cannot be read. */
async function readPolicy($: EngineInterface, cwd: string): Promise<LoadedPolicy> {
  try {
    return loadPolicy(DEFAULT_RULES, await readPolicyText($, cwd))
  } catch (error) {
    const defaults = loadPolicy(DEFAULT_RULES, null)
    return { ...defaults, errors: [`politique illisible (${String(error)}), règles par défaut seules`, ...defaults.errors] }
  }
}

async function loadSession($: EngineInterface): Promise<Session> {
  const cwd = await $.session.cwd()
  // The engine wants each variable named literally, so that what a module reads can be listed.
  const env = { CLAUDE_AGENT: await $.env.get('CLAUDE_AGENT'), HOME: await $.env.get('HOME'), PATH: await $.env.get('PATH') }
  const roots = await repoRoots($, cwd)
  const facts: SessionFacts = { cwd, env, isInteractive: (await $.session.surfaces()).length > 0, ...(roots ? { roots } : {}) }
  const policy = await readPolicy($, cwd)
  await update($, policyState, () => policy)
  await update($, factsState, () => facts)
  if (policy.errors.length > 0) $.ui.toast(`ronce : ${policy.errors.length} erreur(s) dans la politique, voir /ronce-hits`)
  return { policy, facts }
}

/** The skills of one source; a missing folder, or a skill without a readable SKILL.md, is left out. */
async function readCatalogSource($: EngineInterface, source: SkillCatalogSource, facts: SessionFacts): Promise<CatalogSkill[]> {
  const dir = catalogDir(source.dir, $.plugin.root, facts.roots?.worktreeRoot ?? facts.cwd, facts.env.HOME)
  if (!(await $.fs.exists(dir))) return []
  const skills = await Promise.all(
    (await $.fs.list(dir)).map(entry =>
      $.fs
        .read(`${dir}/${entry.name}/SKILL.md`)
        .then(text => parseSkill(entry.name, text, source.namespace))
        .catch(() => null),
    ),
  )
  return skills.filter((skill): skill is CatalogSkill => skill !== null)
}

/** The catalog, read on first need: the session start reads it ahead, a prompt that comes first waits for it. */
async function ensureCatalog($: EngineInterface, sources: readonly SkillCatalogSource[], facts: SessionFacts): Promise<CatalogSkill[]> {
  const known = await read($, catalogState)
  if (known) return known
  const catalog = mergeCatalogs(await Promise.all(sources.map(source => readCatalogSource($, source, facts))))
  await update($, catalogState, () => catalog)
  return catalog
}

/** Work the session start sets going without holding up the first prompt; a failure is logged, never thrown. */
async function startBackground($: EngineInterface): Promise<void> {
  const { policy, facts } = await ensureSession($)
  const { worktree, freshness, band, skillCatalog } = policy.features
  const tasks: [string, () => Promise<void>][] = [
    ['liens du worktree', async () => { if (worktree && facts.roots) await linkWorktreeFiles($, facts.roots, worktree.links) }],
    ['fraîcheur de la branche de base', async () => { if (freshness) await warnIfStale($, facts.cwd, freshness) }],
    ['catalogue de skills', async () => { if (skillCatalog) await ensureCatalog($, skillCatalog.sources, facts) }],
    ['bandeau', async () => { if (band) await refreshBand($, policy, facts) }],
  ]
  for (const [name, task] of tasks) {
    try {
      await task()
    } catch (error) {
      $.ui.log(`ronce : ${name} en échec (${String(error)})`, { to: 'debug' })
    }
  }
  if (band) {
    $.clock.every(BAND_REFRESH_MS, () => {
      refreshBand($, policy, facts).catch(error => $.ui.log(`ronce : bandeau en échec (${String(error)})`, { to: 'debug' }))
    })
  }
}

/** A dev agent past the merge request or worktree budget; null when it may go (budget off, exempt, under the caps). */
async function agentBudgetDenial($: EngineInterface, policy: LoadedPolicy, facts: SessionFacts, subagentType: string | undefined): Promise<string | null> {
  const budget = policy.features.agentBudget
  if (!budget || !facts.roots || isExempt(subagentType, budget.exempt)) return null
  const reading = await readBudget($, budget, facts.roots.mainRoot)
  const denial = budgetDenial(reading)
  return denial ? `ronce/${AGENT_BUDGET_RULE} : ${denial}` : null
}

/** The policy's own hint first; otherwise the catalog skills whose triggers the prompt holds. */
async function skillReminder($: EngineInterface, { policy, facts }: Session, prompt: string): Promise<string | null> {
  const hint = hintFor(policy.features.skillHints, prompt)
  if (hint) return hintText(hint)
  const catalog = policy.features.skillCatalog
  if (!catalog) return null
  const names = catalogMatches(await ensureCatalog($, catalog.sources, facts), prompt, catalog.max)
  return names.length > 0 ? catalogText(names) : null
}

/** The session's policy and facts, loaded on first need (a reload of the module keeps them). */
async function ensureSession($: EngineInterface): Promise<Session> {
  const policy = await read($, policyState)
  const facts = await read($, factsState)
  return policy && facts ? { policy, facts } : loadSession($)
}

async function shapeBash(
  $: EngineInterface,
  ran: ToolCallResult,
  policy: LoadedPolicy,
  home: string | undefined,
  sessionId: string,
  toolUseId: string,
): Promise<{ ran: ToolCallResult; shaping?: ToolEvent['shaping'] }> {
  const stdout = (ran.result as { stdout?: unknown } | undefined)?.stdout
  if (typeof stdout !== 'string') return { ran }
  const path = fullOutputPath(expandHome(policy.shaping.dir, home), sessionId, toolUseId)
  const plan = planShaping(stdout, policy.shaping, path)
  if (!plan) return { ran }
  const sizes = { originalChars: plan.originalChars, keptChars: plan.keptChars }
  if (policy.shaping.mode !== 'enforce') return { ran, shaping: { ...sizes, applied: false } }
  try {
    await $.fs.write(path, stdout)
  } catch (error) {
    // Without the full output on disk the cut would lose data: the model gets the whole output instead.
    $.ui.log(`ronce : sortie complète non écrite (${String(error)}), façonnage annulé`, { to: 'debug' })
    return { ran, shaping: { ...sizes, applied: false } }
  }
  const shaped = { result: { ...(ran.result as object), stdout: plan.text }, ...(ran.context ? { context: ran.context } : {}) }
  return { ran: shaped as ToolCallResult, shaping: { ...sizes, applied: true } }
}

function withWarnings(ran: ToolCallResult, warnings: readonly string[]): ToolCallResult {
  if (warnings.length === 0 || ran.deny !== undefined) return ran
  return { ...ran, context: [...(ran.context ?? []), ...warnings] } as ToolCallResult
}

async function flush($: EngineInterface): Promise<void> {
  const { policy, facts } = await ensureSession($)
  const sessionId = await $.session.id()
  const ts = new Date(await $.clock.now()).toISOString()
  const usage = await $.session.usage().catch((error: unknown) => {
    $.ui.log(`ronce : coût de session indisponible (${String(error)})`, { to: 'debug' })
    return undefined
  })
  const turn = turnEvent({ ts, sessionId, projectDir: facts.cwd, costUsd: usage?.cost?.usd, contextPercent: usage?.context.percent })
  await update($, telemetryState, buffer => appendCapped(buffer, turn))

  const delta = await read($, hitsState)
  if (Object.keys(delta).length > 0) {
    const stored = ((await $.store.get(HITS_STORE_KEY)) ?? {}) as HitStats
    await $.store.set(HITS_STORE_KEY, mergeHits(stored, delta))
    await update($, hitsState, () => ({}))
  }

  const events = await read($, telemetryState)
  if (!policy.telemetry) {
    await update($, telemetryState, () => [])
    return
  }
  const seq = await update($, flushSeqState, n => n + 1)
  const path = batchPath(expandHome(policy.telemetry.dir, facts.env.HOME), ts, sessionId, seq)
  try {
    await $.fs.write(path, toJsonl(events))
    await update($, telemetryState, buffer => buffer.slice(events.length))
  } catch (error) {
    // The buffer is kept (capped) and written at the next turn.
    $.ui.log(`ronce : télémétrie non écrite (${String(error)})`, { to: 'debug' })
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await loadSession($)
    // Literal names, here and in the matcher below: the engine then knows this hook answers its own command.
    await $.command.register({ name: 'ronce-hits', description: 'Règles ronce déclenchées (shadow compris) et erreurs de politique' })
    // Detached from the start dispatch: a fetch or a budget reading must not hold up the first prompt.
    $.clock.after(0, () => {
      startBackground($).catch(error => $.ui.log(`ronce : démarrage en arrière-plan en échec (${String(error)})`, { to: 'debug' }))
    })
    return started
  })

  on('tool.call', async ($, e, next) => {
    const { policy, facts } = await ensureSession($)
    const call = toRawCall(e as unknown as Record<string, unknown>)
    const verdicts = evaluate(policy.rules, call, facts)
    const decision = decide(verdicts)
    if (verdicts.length > 0) await update($, hitsState, stats => recordHits(stats, verdicts, sampleOf(call)))
    const sessionId = await $.session.id()
    const track = async (outcome: ToolOutcome): Promise<void> => {
      const ts = new Date(await $.clock.now()).toISOString()
      const event = toolEvent({ ts, sessionId, projectDir: facts.cwd, agentId: e.agentId, call, verdicts, outcome })
      await update($, telemetryState, buffer => appendCapped(buffer, event))
    }

    if (decision.deny) {
      await track({ success: false, denied: true, durationMs: 0 })
      return { deny: `ronce/${decision.deny.ruleId} : ${decision.deny.message}` }
    }

    if (e.tool === 'Agent') {
      const overBudget = await agentBudgetDenial($, policy, facts, e.subagent_type).catch((error: unknown) => {
        // The budget is a brake, not a gate: when it cannot be read, the agent goes.
        $.ui.log(`ronce : budget d'agents illisible (${String(error)})`, { to: 'debug' })
        return null
      })
      if (overBudget) {
        await track({ success: false, denied: true, durationMs: 0 })
        return { deny: overBudget }
      }
    }

    const startedAt = await $.clock.now()
    const rewritten = decision.rewrite?.rewrite?.command
    const ran = e.tool === 'Bash' && rewritten !== undefined ? await next({ ...e, command: rewritten }) : await next(e)
    const durationMs = (await $.clock.now()) - startedAt
    const success = ran.deny === undefined && ran.isError !== true
    const toolUseId = e.tool_use_id ?? String(startedAt)
    const shaped = success && e.tool === 'Bash'
      ? await shapeBash($, ran, policy, facts.env.HOME, sessionId, toolUseId)
      : { ran }
    await track({ success, denied: ran.deny !== undefined, durationMs, shaping: shaped.shaping })
    const isFileEdit = success && (e.tool === 'Edit' || e.tool === 'Write') && call.file_path !== undefined
    const checkFindings = isFileEdit ? await runEditChecks($, policy, facts, call.file_path!) : []
    return withWarnings(shaped.ran, [...decision.warns.map(v => `ronce/${v.ruleId} : ${v.message}`), ...checkFindings])
  }).catch((_$, e, next) => {
    // A failure after the tool ran replays its result. Before it ran, a shell command is refused,
    // since the footguns live there; any other tool goes through, having no marker to lift a refusal.
    if (next.called || e.tool !== 'Bash' || allowedRuleIds(e.command).includes(GUARD_ERROR_RULE)) return next(e)
    return { deny: GUARD_ERROR_MESSAGE }
  })

  on('tool.check', async ($, e, next) => {
    const verdict = await next(e)
    if (verdict.decision === 'deny') return verdict
    const { policy, facts } = await ensureSession($)
    const call = toRawCall({ ...(e.input as Record<string, unknown>), tool: e.tool })
    const asks = decide(evaluate(policy.rules, call, facts)).asks
    if (asks.length === 0) return verdict
    return { decision: 'ask', reason: asks.map(v => `ronce/${v.ruleId} : ${v.message}`).join(' · ') }
  }).catch((_$, e, next) => next(e))

  on('prompt.submit', async ($, e, next) => {
    await update($, lastIntentState, () => e.text)
    // A person spoke: the background checks may wake the session again.
    if (e.origin.kind !== 'plugin') await update($, wakesState, () => 0)
    const reminder = await skillReminder($, await ensureSession($), e.text)
    return reminder ? next({ ...e, context: [...(e.context ?? []), reminder] }) : next(e)
  }).catch((_$, e, next) => next(e))

  on('session.compact', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId) return done
    const { policy, facts } = await ensureSession($)
    if (policy.features.memo) {
      await appendMemo($, facts, policy.features.memo, await read($, lastIntentState)).catch((error: unknown) =>
        $.ui.log(`ronce : mémo de compaction non ajouté (${String(error)})`, { to: 'debug' }),
      )
    }
    return done
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // A render hook only reads: the policy is loaded by the session start, never from here.
    const policy = await read($, policyState)
    const status = await read($, bandState)
    if (!policy?.features.band || !status || e.props.hasSurvey) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box>
        <Text dimColor>{bandLine(status)}</Text>
      </Box>
    )
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    await flush($)
    // Detached and one at a time: the checks may take minutes, and the turn is over.
    if (!isBackgroundRunning) {
      isBackgroundRunning = true
      $.clock.after(0, () => {
        runBackgroundChecks($)
          .catch(error => $.ui.log(`ronce : vérifications de fond en échec (${String(error)})`, { to: 'debug' }))
          .finally(() => {
            isBackgroundRunning = false
          })
      })
    }
    return done
  })

  on('session.end', async ($, e, next) => {
    await flush($)
    return next(e)
  })

  on('command.run', { command: 'ronce-hits' }, async $ => {
    const { policy } = await ensureSession($)
    const stored = ((await $.store.get(HITS_STORE_KEY)) ?? {}) as HitStats
    return { text: formatHits(mergeHits(stored, await read($, hitsState)), policy.errors) }
  })
}

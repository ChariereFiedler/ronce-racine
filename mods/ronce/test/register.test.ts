import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

const CWD = '/repo'
const BASH_OK = { result: { stdout: 'done', stderr: '', interrupted: false } }

type SessionIdAnswer = () => { value: string }
const SESSION_ID: SessionIdAnswer = () => ({ value: 'sess-1' })
const FAILING_SESSION_ID: SessionIdAnswer = () => {
  throw new Error('session id unavailable')
}

/** The engine beneath the plugin: session, environment, clock, and a policy file wherever it is looked for. */
function world(on: On, policy: object, sessionId: SessionIdAnswer = SESSION_ID): void {
  mock.clock(on)
  mock.env(on, { HOME: '/home/test' })
  on('session.cwd', () => ({ value: CWD }))
  on('session.id', sessionId)
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('fs.exists', () => ({ value: true }))
  on('fs.read', () => ({ value: JSON.stringify({ version: 1, telemetry: null, ...policy }) }))
}

test('a shadow rule lets the call through untouched', async ($, on) => {
  world(on, { modes: { 'shell-read': 'shadow' } })
  let ran = ''
  on('tool.call', { tool: 'Bash' }, (_$, e) => {
    ran = e.command
    return BASH_OK
  })
  const out = await $.tool.call({ tool: 'Bash', command: 'sed -n 1,80p src/main.rs' })
  expect(out.deny).toBeUndefined()
  expect(ran).toBe('sed -n 1,80p src/main.rs')
})

test('an enforced deny stops the call before the tool runs', async ($, on) => {
  world(on, { modes: { 'shell-read': 'enforce' } })
  let didRun = false
  on('tool.call', { tool: 'Bash' }, () => {
    didRun = true
    return BASH_OK
  })
  const out = await $.tool.call({ tool: 'Bash', command: 'sed -n 1,80p src/main.rs' })
  expect(out.deny).toContain('ronce/shell-read')
  expect(didRun).toBe(false)
})

test('an enforced cd-cwd-noop runs the command without its cd', async ($, on) => {
  world(on, { modes: { 'cd-cwd-noop': 'enforce' } })
  let ran = ''
  on('tool.call', { tool: 'Bash' }, (_$, e) => {
    ran = e.command
    return BASH_OK
  })
  await $.tool.call({ tool: 'Bash', command: `cd ${CWD} && git status` })
  expect(ran).toBe('git status')
})

test('a guard that fails refuses a Bash call, unless the marker lifts it', async ($, on) => {
  world(on, {}, FAILING_SESSION_ID)
  let ran = ''
  on('tool.call', { tool: 'Bash' }, (_$, e) => {
    ran = e.command
    return BASH_OK
  })
  const refused = await $.tool.call({ tool: 'Bash', command: 'git status' })
  expect(refused.deny).toContain('guard-error')
  expect(ran).toBe('')
  await $.tool.call({ tool: 'Bash', command: 'git status # ronce:allow guard-error' })
  expect(ran).toBe('git status # ronce:allow guard-error')
})

test('a guard that fails lets a call of another tool through', async ($, on) => {
  world(on, {}, FAILING_SESSION_ID)
  on('tool.call', { tool: 'Read' }, () => ({ result: { type: 'text', file: { filePath: '/repo/a.ts', content: 'x', numLines: 1, startLine: 1, totalLines: 1 } } }))
  const out = await $.tool.call({ tool: 'Read', file_path: '/repo/a.ts' })
  expect(out.deny).toBeUndefined()
})

test('a long Bash output reaches the model shaped, the whole of it kept on disk', async ($, on) => {
  world(on, {})
  const written: { path: string; text: string }[] = []
  on('fs.write', (_$, e) => {
    written.push(e as { path: string; text: string })
    return { value: undefined }
  })
  const long = Array.from({ length: 500 }, (_, i) => `line ${i} ${'x'.repeat(20)}`).join('\n')
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: long, stderr: '', interrupted: false } }))
  const out = await $.tool.call({ tool: 'Bash', command: 'cargo build' })
  const stdout = (out.result as { stdout: string }).stdout
  expect(stdout).toContain('460 lignes retirées sur 500')
  expect(stdout).toContain('/home/test/.claude/ronce/outputs/sess-1/')
  expect(written.find(w => w.path.startsWith('/home/test/.claude/ronce/outputs/'))?.text).toBe(long)
})

const OPEN_MRS = [11, 12, 13, 14, 15].map(iid => ({ iid, title: `mr ${iid}`, draft: false, labels: [] }))
const BUDGET_POLICY = {
  agentBudget: {
    exempt: ['Explore'],
    cacheMs: 60_000,
    mergeRequests: {
      cap: 5, project: '1', gitlabUrl: 'https://gitlab.example', tokenFile: '.env', tokenVar: 'GITLAB_TOKEN',
      humanGatedLabels: ['needs-human-review'],
    },
  },
}

/** A repository at /repo, a token in its .env, and five open merge requests on the forge. */
function forge(on: On): void {
  on('process.run', (_$, e) => {
    const argv = (e as { argv: readonly string[] }).argv.join(' ')
    if (argv.includes('--show-toplevel')) return { value: { exitCode: 0, stdout: `${CWD}\n`, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    if (argv.includes('--git-common-dir')) return { value: { exitCode: 0, stdout: `${CWD}/.git\n`, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    return { value: { exitCode: 1, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('http.fetch', () => ({ value: { status: 200, ok: true, headers: {}, text: JSON.stringify(OPEN_MRS) } }))
}

function worldWithEnv(on: On, policy: object): void {
  mock.clock(on)
  mock.env(on, { HOME: '/home/test' })
  on('session.cwd', () => ({ value: CWD }))
  on('session.id', SESSION_ID)
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('fs.exists', () => ({ value: true }))
  on('fs.read', (_$, e) => {
    const path = (e as { path: string }).path
    return { value: path.endsWith('/.env') ? 'GITLAB_TOKEN=abc\n' : JSON.stringify({ version: 1, telemetry: null, ...policy }) }
  })
}

test('a dev agent is refused once the merge request budget is reached', async ($, on) => {
  worldWithEnv(on, BUDGET_POLICY)
  forge(on)
  let spawned = false
  on('tool.call', { tool: 'Agent' }, () => {
    spawned = true
    return { result: { status: 'completed' } }
  })
  const out = await $.tool.call({ tool: 'Agent', description: 'fix', prompt: 'Corrige le bug.', subagent_type: 'general-purpose' })
  expect(out.deny).toContain('MR budget atteint (5/5 MRs ouvertes : !11, !12, !13, !14, !15)')
  expect(spawned).toBe(false)
})

test('a read-only agent goes through whatever the budget', async ($, on) => {
  worldWithEnv(on, BUDGET_POLICY)
  forge(on)
  let spawned = false
  on('tool.call', { tool: 'Agent' }, () => {
    spawned = true
    return { result: { status: 'completed' } }
  })
  const out = await $.tool.call({ tool: 'Agent', description: 'look', prompt: 'Cherche X.', subagent_type: 'Explore' })
  expect(out.deny).toBeUndefined()
  expect(spawned).toBe(true)
})

test('a prompt that matches a skill hint reaches the model with the hint', async ($, on) => {
  world(on, { skillHints: [{ pattern: 'pipeline (a échoué|ko)', skill: 'pipeline-orchestration', reason: 'pipeline évoqué' }] })
  let context: readonly string[] = []
  on('prompt.submit', (_$, e) => {
    context = e.context ?? []
    return { text: e.text, context: e.context }
  })
  await $.prompt.submit({ text: 'Le pipeline a échoué', wait: false, origin: { kind: 'composer' } })
  expect(context.join('\n')).toContain('Le skill `pipeline-orchestration` correspond à cette demande')
})

const SWEEP_SKILL = '---\nname: detection-sweep\ndescription: Use for a sweep - "lance un sweep".\n---\n'

test('a prompt holding a catalog trigger reaches the model with the plugin skill named', async ($, on) => {
  mock.clock(on)
  mock.env(on, { HOME: '/home/test' })
  on('session.cwd', () => ({ value: CWD }))
  on('session.id', SESSION_ID)
  on('session.surfaces', () => ({ value: ['terminal'] }))
  on('fs.exists', () => ({ value: true }))
  // The project has no skills of its own; the plugin's catalog holds one.
  on('fs.list', (_$, e) => {
    const path = (e as { path?: string }).path ?? ''
    return { value: path.endsWith('/.claude/skills') ? [] : [{ name: 'detection-sweep', kind: 'dir', size: 0, mtimeMs: 0, isLink: false }] }
  })
  on('fs.read', (_$, e) => {
    const path = (e as { path: string }).path
    return { value: path.endsWith('/SKILL.md') ? SWEEP_SKILL : JSON.stringify({ version: 1, telemetry: null }) }
  })
  let context: readonly string[] = []
  on('prompt.submit', (_$, e) => {
    context = e.context ?? []
    return { text: e.text, context: e.context }
  })
  await $.prompt.submit({ text: 'Lance un sweep sur le projet', wait: false, origin: { kind: 'composer' } })
  expect(context.join('\n')).toContain('Skills dont les déclencheurs figurent dans cette demande : ronce-racine:detection-sweep.')
})

const runResult = (exitCode: number, stdout: string) =>
  ({ value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })

test('an edit that fails a check reaches the model with the finding', async ($, on) => {
  world(on, {
    checks: {
      onEdit: [{ id: 'rustfmt', title: 'rustfmt', match: '\\.rs$', run: ['rustfmt', '--check', '{file}'], timeoutMs: 1000, maxLines: 5 }],
      background: [],
    },
  })
  on('process.run', (_$, e) => {
    const argv = e.argv
    if (argv.includes('--show-toplevel')) return runResult(0, `${CWD}\n`)
    if (argv.includes('--git-common-dir')) return runResult(0, `${CWD}/.git\n`)
    if (argv[0] === 'rustfmt') return runResult(1, `Diff in ${CWD}/src/a.rs at line 3`)
    return runResult(1, '')
  })
  on('tool.call', { tool: 'Edit' }, () => ({ result: { filePath: `${CWD}/src/a.rs` } }))
  const out = await $.tool.call({ tool: 'Edit', file_path: `${CWD}/src/a.rs`, old_string: 'a', new_string: 'b' })
  const context = (out.context ?? []).join('\n')
  expect(context).toContain('ronce/check:rustfmt')
  expect(context).toContain('Diff in /repo/src/a.rs at line 3')
})

test('an enforced warn reaches the model as context', async ($, on) => {
  world(on, { modes: { 'devnull-hides-errors': 'enforce' } })
  on('tool.call', { tool: 'Bash' }, () => BASH_OK)
  const out = await $.tool.call({ tool: 'Bash', command: 'cargo build 2>/dev/null' })
  expect((out.context ?? []).join(' ')).toContain('ronce/devnull-hides-errors')
})

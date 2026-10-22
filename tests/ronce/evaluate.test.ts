import { describe, expect, it } from 'vitest'
import type { Rule, Verdict } from '../../mods/ronce/types'
import { DEFAULT_RULES } from '../../mods/ronce/src/policy/defaults.ts'
import { decide, evaluate } from '../../mods/ronce/src/policy/evaluate.ts'

const FACTS = { cwd: '/repo', env: {}, isInteractive: true }
const rule = (over: Partial<Rule>): Rule => ({
  id: 'r', tool: 'Bash', command: 'x', action: 'deny', mode: 'enforce', message: 'm', ...over,
})

describe('evaluate', () => {
  it('matches the command after normalization', () => {
    const verdicts = evaluate([rule({ command: '^npx vue-tsc' })], { tool: 'Bash', command: 'cd /w && npx vue-tsc --noEmit' }, FACTS)
    expect(verdicts.map(v => v.ruleId)).toEqual(['r'])
  })

  it('matches the raw command when the rule is about the prefix itself', () => {
    const call = { tool: 'Bash', command: 'cd ../wt; git reset --hard origin/master' }
    expect(evaluate([rule({ command: ';\\s*git\\s+reset' })], call, FACTS)).toEqual([])
    expect(evaluate([rule({ command: ';\\s*git\\s+reset', raw: true })], call, FACTS)).toHaveLength(1)
  })

  it('honours unless on the raw command', () => {
    const r = rule({ command: 'worktree\\.ts\\s+prune', unless: '--dry-run' })
    expect(evaluate([r], { tool: 'Bash', command: 'npx tsx scripts/dev/worktree.ts prune --dry-run' }, FACTS)).toEqual([])
  })

  it('requires every criterion of the rule', () => {
    const r = rule({ tool: ['Edit', 'Write'], command: undefined, path: '/site/', content: '—' })
    expect(evaluate([r], { tool: 'Edit', file_path: '/repo/site/a.ts', content: 'a, b' }, FACTS)).toEqual([])
    expect(evaluate([r], { tool: 'Edit', file_path: '/repo/site/a.ts', content: 'a — b' }, FACTS)).toHaveLength(1)
  })

  it('checks env conditions, null meaning unset', () => {
    const r = rule({ command: 'git commit', action: 'ask', when: { env: { CLAUDE_AGENT: null } } })
    const call = { tool: 'Bash', command: 'git commit -m "x"' }
    expect(evaluate([r], call, FACTS)).toHaveLength(1)
    expect(evaluate([r], call, { ...FACTS, env: { CLAUDE_AGENT: '1' } })).toEqual([])
  })

  it('flags only the rules the marker lists as bypassed', () => {
    const rules = [rule({ id: 'npx-vue-tsc', command: 'npx vue-tsc' }), rule({ id: 'other', command: 'vue-tsc' })]
    const verdicts = evaluate(rules, { tool: 'Bash', command: 'npx vue-tsc # ronce:allow npx-vue-tsc, unknown-id' }, FACTS)
    expect(verdicts.map(v => [v.ruleId, v.bypassed])).toEqual([['npx-vue-tsc', true], ['other', false]])
  })

  it('matches Read without limit and Agent criteria', () => {
    const hot = rule({ tool: 'Read', command: undefined, path: 'daemon\\.ts$', readWithoutLimit: true, action: 'warn' })
    expect(evaluate([hot], { tool: 'Read', file_path: '/r/daemon.ts' }, FACTS)).toHaveLength(1)
    expect(evaluate([hot], { tool: 'Read', file_path: '/r/daemon.ts', limit: 50 }, FACTS)).toEqual([])
    const haiku = rule({ tool: 'Agent', command: undefined, subagentType: 'review', model: 'haiku' })
    expect(evaluate([haiku], { tool: 'Agent', subagent_type: 'code-reviewer', model: 'haiku' }, FACTS)).toHaveLength(1)
  })

  it('carries the builtin rewrite, appends the builtin detail to the message', () => {
    const noop = rule({ id: 'cd-cwd-noop', command: undefined, builtin: 'cd-cwd-noop', action: 'rewrite' })
    expect(evaluate([noop], { tool: 'Bash', command: 'cd /repo && ls' }, FACTS)[0]?.rewrite?.command).toBe('ls')
    const read = rule({ id: 'shell-read', command: undefined, builtin: 'shell-read', message: 'Lire avec Read' })
    expect(evaluate([read], { tool: 'Bash', command: 'cat src/a.ts' }, FACTS)[0]?.message).toBe('Lire avec Read (src/a.ts)')
  })

  it('never rewrites a command too long to have been matched whole', () => {
    const noop = rule({ id: 'cd-cwd-noop', command: undefined, builtin: 'cd-cwd-noop', action: 'rewrite' })
    const huge = `cd /repo && cat <<'EOF'\n${'y'.repeat(30_000)}\nEOF`
    expect(evaluate([noop], { tool: 'Bash', command: huge }, FACTS)[0]?.rewrite).toBeUndefined()
  })
})

describe('decide', () => {
  const verdict = (action: Verdict['action'], mode: Verdict['mode'] = 'enforce', bypassed = false): Verdict =>
    ({ ruleId: action, action, mode, message: action, bypassed })

  it('lets a deny win over everything else', () => {
    expect(decide([verdict('warn'), verdict('deny')]).deny?.ruleId).toBe('deny')
  })

  it('ignores shadow and bypassed verdicts', () => {
    expect(decide([verdict('deny', 'shadow'), verdict('deny', 'enforce', true)])).toEqual({ rewrite: undefined, asks: [], warns: [] })
  })

  it('collects asks and warns', () => {
    const decision = decide([verdict('ask'), verdict('warn')])
    expect(decision.asks.map(v => v.ruleId)).toEqual(['ask'])
    expect(decision.warns.map(v => v.ruleId)).toEqual(['warn'])
  })

  it('ignores a rewrite verdict that carries no rewrite', () => {
    expect(decide([verdict('rewrite')]).rewrite).toBeUndefined()
  })
})

describe('evaluate on a huge command', () => {
  it('stays under 200 ms with the default catalog on a 1 MB heredoc', () => {
    const huge = `cat > /tmp/big.txt <<'EOF'\n${'abc def; ghi && '.repeat(65_000)}\nEOF`
    const started = performance.now()
    evaluate(DEFAULT_RULES, { tool: 'Bash', command: huge }, { cwd: '/repo', env: {}, isInteractive: true })
    expect(performance.now() - started).toBeLessThan(200)
  })
})

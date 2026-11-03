import { describe, expect, it } from 'vitest'
import type { RuleContext, TicketConfig } from '../../mods/ronce/types'
import { runBuiltin } from '../../mods/ronce/src/policy/builtins.ts'
import { DEFAULT_RULES } from '../../mods/ronce/src/policy/defaults.ts'
import { decide, evaluate } from '../../mods/ronce/src/policy/evaluate.ts'
import { missingHeadings, readPayload } from '../../mods/ronce/src/policy/ticket.ts'

const FACTS = { cwd: '/repo', env: {}, isInteractive: true }
const TICKET: TicketConfig = {
  skill: 'write-github-issue',
  headings: ['## Problem', '## Evidence', ['## Reproduction', '## Current behaviour'], '## Acceptance criteria', '## Not verified'],
}
const SEARCHED: RuleContext = { ticket: TICKET, issuesSearched: true }
const FULL_BODY = [
  '## Problem', 'x', '## Evidence', '- [C] a', '## Current behaviour', 'y', '## Acceptance criteria', '- [ ] z', '## Not verified', 'prod',
].join('\n')
const check = (call: { command: string; files?: Record<string, string> }, context: RuleContext = SEARCHED) =>
  runBuiltin('ticket-needs-skill', { tool: 'Bash', ...call }, FACTS, context)

describe('missingHeadings', () => {
  it('wants each heading as a whole line, ignoring case and trailing spaces', () => {
    expect(missingHeadings('## problem  \r\n## Evidence\n', ['## Problem', '## Evidence'])).toEqual([])
    expect(missingHeadings('Intro ## Problem\n### Evidence', ['## Problem', '## Evidence'])).toEqual(['## Problem', '## Evidence'])
  })

  it('takes one heading of a choice as enough, and names the whole choice when none is there', () => {
    expect(missingHeadings('## Current behaviour', [['## Reproduction', '## Current behaviour']])).toEqual([])
    expect(missingHeadings('', [['## Reproduction', '## Current behaviour']])).toEqual(['## Reproduction | ## Current behaviour'])
  })
})

describe('readPayload', () => {
  it('reads the body and labels of a JSON payload, GitHub or GitLab', () => {
    expect(readPayload('{"title":"x","body":"## Problem\\nx","labels":["bug"]}')).toEqual({ body: '## Problem\nx', labels: ['bug'] })
    expect(readPayload('{"title":"x","description":"## Problem","labels":"bug,api"}')).toEqual({ body: '## Problem', labels: ['bug', 'api'] })
  })

  it('reads form fields, URL-encoded or not', () => {
    expect(readPayload('title=x&description=%23%23+Problem%0Ax&labels=bug')).toEqual({ body: '## Problem\nx', labels: ['bug'] })
    expect(readPayload('description=## Problem 100%')).toEqual({ body: '## Problem 100%', labels: [] })
  })
})

describe('ticket-needs-skill', () => {
  it('refuses a body missing headings, naming the skill to load and what is missing', () => {
    const found = check({ command: 'gh issue create --title x --body "## Problem\nx"' })
    expect(found.matched).toBe(true)
    const detail = found.matched ? (found.detail ?? '') : ''
    expect(detail).toContain('Skill write-github-issue')
    expect(detail).toContain('## Evidence, ## Reproduction | ## Current behaviour, ## Acceptance criteria, ## Not verified')
    expect(found.matched && found.action).toBeFalsy()
  })

  it('lets a complete inline body through', () => {
    expect(check({ command: `gh issue create --title x --body "${FULL_BODY}"` }).matched).toBe(false)
  })

  it('reads the body from the file the host attached, and refuses a file it could not read', () => {
    const command = 'gh issue create --title x --body-file /tmp/s/issue.md'
    expect(check({ command, files: { '/tmp/s/issue.md': FULL_BODY } }).matched).toBe(false)
    expect(check({ command, files: { '/tmp/s/issue.md': '## Problem' } }).matched).toBe(true)
    const unread = check({ command })
    expect(unread.matched && unread.detail).toContain('/tmp/s/issue.md')
  })

  it('refuses a creation without a body', () => {
    const found = check({ command: 'gh issue create --title x' })
    expect(found.matched && found.detail).toContain('## Problem')
  })

  it('checks the body of an API payload', () => {
    const payload = JSON.stringify({ title: 'x', description: FULL_BODY })
    const command = 'curl -X POST https://gitlab.com/api/v4/projects/1/issues -H "Content-Type: application/json" -d @p.json'
    expect(check({ command, files: { 'p.json': payload } }).matched).toBe(false)
  })

  it('refuses a creation no issue search preceded, unless the project turned that off', () => {
    const command = `gh issue create --title x --body "${FULL_BODY}"`
    const unsearched = check({ command }, { ticket: TICKET, issuesSearched: false })
    expect(unsearched.matched && unsearched.detail).toContain('gh issue list --search')
    expect(check({ command }, { ticket: { ...TICKET, requireSearch: false }, issuesSearched: false }).matched).toBe(false)
  })

  it('requires one of the configured labels when the project lists some', () => {
    const ticket = { ...TICKET, labels: ['bug', 'enhancement'] }
    const command = `gh issue create --title x --body "${FULL_BODY}"`
    const unlabelled = check({ command }, { ticket, issuesSearched: true })
    expect(unlabelled.matched && unlabelled.detail).toContain('bug | enhancement')
    expect(check({ command: `${command} --label enhancement` }, { ticket, issuesSearched: true }).matched).toBe(false)
  })

  it('without a ticket configuration, only reminds: a warning, never a refusal', () => {
    const found = check({ command: 'gh issue create --title x --body y' }, { ticket: null, issuesSearched: false })
    expect(found).toMatchObject({ matched: true, action: 'warn' })
    expect(found.matched && found.detail).toContain('ronce-racine:bug-ticket-root-cause')
  })

  it('leaves every other command alone', () => {
    expect(check({ command: 'gh issue list --search timeout' }).matched).toBe(false)
    expect(check({ command: 'gh issue comment 12 --body x' }).matched).toBe(false)
  })
})

describe('the default ticket-needs-skill rule', () => {
  const evaluated = (command: string, context: RuleContext) =>
    decide(evaluate(DEFAULT_RULES, { tool: 'Bash', command }, FACTS, context))

  it('denies an incomplete issue when the project configures tickets', () => {
    expect(evaluated('gh issue create --title x --body "## Problem"', SEARCHED).deny?.ruleId).toBe('ticket-needs-skill')
  })

  it('warns, without denying, when the project configures nothing', () => {
    const decision = evaluated('gh issue create --title x --body "## Problem"', { ticket: null, issuesSearched: false })
    expect(decision.deny).toBeUndefined()
    expect(decision.warns.map(v => v.ruleId)).toEqual(['ticket-needs-skill'])
  })

  it('lets the marker lift the refusal', () => {
    const decision = evaluated('gh issue create --title x --body "## Problem" # ronce:allow ticket-needs-skill', SEARCHED)
    expect(decision.deny).toBeUndefined()
  })
})

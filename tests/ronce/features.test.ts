import { describe, expect, it } from 'vitest'
import { activeWorktrees, blockingMergeRequests, budgetDenial, isExempt } from '../../mods/ronce/src/features/budget.ts'
import { freshnessNote } from '../../mods/ronce/src/features/freshness.ts'
import { memoText, ticketFrom } from '../../mods/ronce/src/features/memo.ts'
import { hintFor, hintText } from '../../mods/ronce/src/features/skill-hints.ts'
import { linksToCreate } from '../../mods/ronce/src/features/worktree-env.ts'
import { envValue } from '../../mods/ronce/src/features/env-file.ts'
import { baseName, parentDir } from '../../mods/ronce/src/policy/paths.ts'
import { bandLine, projectTitle } from '../../mods/ronce/src/ui/band.ts'

describe('small helpers', () => {
  it('reads a variable of an env file, quoted or not', () => {
    const text = '# comment\nGITLAB_TOKEN="abc def"\nOTHER=x\nEMPTY=\n'
    expect(envValue(text, 'GITLAB_TOKEN')).toBe('abc def')
    expect(envValue(text, 'OTHER')).toBe('x')
    expect(envValue(text, 'EMPTY')).toBeNull()
    expect(envValue(text, 'MISSING')).toBeNull()
  })

  it('splits a path without Node', () => {
    expect(parentDir('/home/c/lab/granit-golem')).toBe('/home/c/lab')
    expect(baseName('/home/c/lab/granit-golem/')).toBe('granit-golem')
  })

  it('titles a project from its folder name', () => {
    expect(projectTitle('granit-golem')).toBe('Granit Golem')
    expect(projectTitle('ronce_racine')).toBe('Ronce Racine')
  })
})

describe('skill hints', () => {
  const hints = [
    { pattern: 'pipeline (a échoué|ko)', skill: 'pipeline-orchestration', reason: 'pipeline GitLab évoqué' },
    { pattern: '^\\s*on continue\\s*\\??\\s*$', skill: 'session-resume', reason: 'reprise de session', note: 'Lire la session.' },
  ]

  it('suggests the first skill whose pattern matches, ignoring case', () => {
    expect(hintFor(hints, 'Le Pipeline a échoué ce matin')?.skill).toBe('pipeline-orchestration')
    expect(hintFor(hints, 'on continue ?')?.skill).toBe('session-resume')
    expect(hintFor(hints, 'ajoute un bouton')).toBeNull()
  })

  it('words the hint as a fact, with its note', () => {
    expect(hintText(hints[1]!)).toBe(
      '<skill-reminder>\nLe skill `session-resume` correspond à cette demande (reprise de session).\nLire la session.\n</skill-reminder>',
    )
  })
})

describe('memo', () => {
  it('reads the ticket from the branch', () => {
    expect(ticketFrom('feat/1158-x', '(?:feat|fix|chore)\\/(\\d+)')).toBe('1158')
    expect(ticketFrom('docs/x', '(?:feat|fix|chore)\\/(\\d+)')).toBeNull()
  })

  it('carries the branch, the ticket, the last intent quoted and a stale decisions file', () => {
    const text = memoText({
      branch: 'feat/1158-x',
      ticket: '1158',
      lastIntent: 'corrige le bug\npuis pousse',
      decisions: { file: '.claude/decisions.md', ageDays: 25, staleDays: 14 },
    })
    expect(text).toContain('**Branche :** `feat/1158-x` (ticket #1158)')
    expect(text).toContain('> corrige le bug\n> puis pousse')
    expect(text).toContain('.claude/decisions.md non mis à jour depuis 25 jours')
  })

  it('cuts a long intent and leaves out a fresh decisions file', () => {
    const text = memoText({ branch: 'master', ticket: null, lastIntent: 'x'.repeat(900), decisions: { file: 'd.md', ageDays: 3, staleDays: 14 } })
    expect(text).toContain(`> ${'x'.repeat(600)}\n`)
    expect(text).not.toContain('x'.repeat(601))
    expect(text).not.toContain('d.md')
    expect(text).not.toContain('ticket')
  })
})

describe('freshness', () => {
  it('says nothing when the local branch is up to date', () => {
    expect(freshnessNote({ behind: 0, ahead: 0, branch: 'feat/1-x', remote: 'origin', base: 'master' })).toBeNull()
  })

  it('warns of a lag, and of a divergence', () => {
    const note = freshnessNote({ behind: 3, ahead: 1, branch: 'feat/1-x', remote: 'origin', base: 'master' })!
    expect(note).toContain('master local en retard de 3 commit(s) sur origin/master')
    expect(note).toContain('1 commit(s) local(aux) non poussés')
    expect(note).toContain('Branche courante : feat/1-x')
  })
})

describe('agent budget', () => {
  const exempt = ['Explore', 'Plan', 'code-reviewer']

  it('exempts the read-only agent types, and only them', () => {
    expect(isExempt('Explore', exempt)).toBe(true)
    expect(isExempt('general-purpose', exempt)).toBe(false)
    expect(isExempt(undefined, exempt)).toBe(false)
  })

  it('exempts a plugin agent by its name without the plugin prefix', () => {
    expect(isExempt('ronce-racine:code-reviewer', exempt)).toBe(true)
    expect(isExempt('superpowers:code-reviewer', exempt)).toBe(true)
    expect(isExempt('ronce-racine:qa-tester', exempt)).toBe(false)
  })

  it('counts neither drafts nor merge requests waiting on a person', () => {
    const mrs = [
      { iid: 1, title: 'a', draft: false, labels: [] },
      { iid: 2, title: 'b', draft: true, labels: [] },
      { iid: 3, title: 'c', draft: false, labels: ['needs-human-review'] },
    ]
    expect(blockingMergeRequests(mrs, ['needs-human-review']).map(m => m.iid)).toEqual([1])
  })

  it('counts neither empty worktrees nor folders that are not repositories', () => {
    const states = [
      { name: 'repo-wt-1', isRepo: true, commitsAhead: 2, hasChanges: false, ageMinutes: 300 },
      { name: 'repo-wt-2', isRepo: true, commitsAhead: 0, hasChanges: false, ageMinutes: 300 },
      { name: 'repo-wt-3', isRepo: true, commitsAhead: 0, hasChanges: false, ageMinutes: 5 },
      { name: 'repo-wt-archive', isRepo: false, commitsAhead: null, hasChanges: null, ageMinutes: 0 },
    ]
    expect(activeWorktrees(states, 15).map(w => w.name)).toEqual(['repo-wt-1', 'repo-wt-3'])
  })

  it('refuses at the cap and names what holds the budget', () => {
    expect(budgetDenial({ mergeRequests: { count: 4, cap: 5, iids: [1, 2, 3, 4] } })).toBeNull()
    const denial = budgetDenial({
      mergeRequests: { count: 5, cap: 5, iids: [11, 12, 13, 14, 15] },
      worktrees: { count: 6, cap: 6, names: ['wt-1', 'wt-2'] },
    })!
    expect(denial).toContain('MR budget atteint (5/5 MRs ouvertes : !11, !12, !13, !14, !15)')
    expect(denial).toContain('Worktree budget atteint (6/6 actifs : wt-1, wt-2)')
  })
})

describe('worktree links', () => {
  it('links the missing files of a linked worktree to the main checkout', () => {
    const existing = new Set(['/repo/.env', '/repo/.npmrc', '/repo-wt-1/.npmrc'])
    expect(linksToCreate({ worktreeRoot: '/repo-wt-1', mainRoot: '/repo', names: ['.env', '.npmrc', '.missing'], exists: p => existing.has(p) }))
      .toEqual([{ link: '/repo-wt-1/.env', target: '/repo/.env' }])
  })

  it('does nothing in the main checkout itself', () => {
    expect(linksToCreate({ worktreeRoot: '/repo', mainRoot: '/repo', names: ['.env'], exists: () => true })).toEqual([])
  })
})

describe('band', () => {
  it('joins what it knows, in a fixed order', () => {
    expect(bandLine({
      project: 'Granit Golem', branch: 'feat/1-x', contextPercent: 38, costUsd: 12.4,
      worktrees: { count: 6, cap: 6 }, mergeRequests: { count: 3, cap: 5 },
    })).toBe('🪨 Granit Golem · feat/1-x · ctx 38 % · 12,40 $ · 🌳 6/6 worktrees · 📥 3/5 MRs')
  })

  it('leaves out what it does not know', () => {
    expect(bandLine({ project: 'ronce' })).toBe('🪨 ronce')
  })
})

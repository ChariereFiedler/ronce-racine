import { describe, expect, it } from 'vitest'
import { commitSubject, countRepeats, fixRepeatText, parseFixSubject } from '../../mods/ronce/src/features/fix-repeat.ts'

describe('commitSubject', () => {
  it('reads the first line of a -m message', () => {
    expect(commitSubject('git commit -m "fix(api): handle null (Refs #1)"')).toBe('fix(api): handle null (Refs #1)')
  })

  it('reads a single-quoted message and ignores later -m paragraphs', () => {
    expect(commitSubject("git commit -m 'fix: a' -m 'details'")).toBe('fix: a')
  })

  it('returns null when the message is not in the command', () => {
    expect(commitSubject('git commit --amend --no-edit')).toBeNull()
    expect(commitSubject('git commit -F msg.txt')).toBeNull()
    expect(commitSubject('git status')).toBeNull()
  })
})

describe('parseFixSubject', () => {
  it('reads the scope and the ticket of a fix', () => {
    expect(parseFixSubject('fix(ci): sonde non fatale (Refs #2329)')).toEqual({ scope: 'ci', ticket: '2329' })
  })

  it('reads a Bourgeon ticket id', () => {
    expect(parseFixSubject('fix(web): marge (T-B3JKSN)')).toEqual({ scope: 'web', ticket: 'T-B3JKSN' })
  })

  it('accepts a fix without scope or ticket', () => {
    expect(parseFixSubject('fix: typo')).toEqual({ scope: null, ticket: null })
  })

  it('returns null for anything that is not a fix', () => {
    expect(parseFixSubject('feat(api): add filter')).toBeNull()
    expect(parseFixSubject('prefix(api): x')).toBeNull()
  })
})

describe('countRepeats', () => {
  const history = [
    { subject: 'fix(e2e): a (Refs #1987)', ageHours: 1 },
    { subject: 'fix(e2e): b (Refs #1987)', ageHours: 20 },
    { subject: 'fix(e2e): c (Refs #1987)', ageHours: 60 },
    { subject: 'feat(e2e): d (Refs #1987)', ageHours: 2 },
    { subject: 'fix(ci): e', ageHours: 3 },
  ]

  it('counts fixes on the same ticket inside the window only', () => {
    expect(countRepeats(history, { scope: 'x', ticket: '1987' }, 48).sameTicket).toBe(2)
  })

  it('counts fixes on the same scope inside the window only', () => {
    expect(countRepeats(history, { scope: 'e2e', ticket: null }, 48).sameScope).toBe(2)
  })

  it('counts nothing for a candidate with neither scope nor ticket', () => {
    expect(countRepeats(history, { scope: null, ticket: null }, 48)).toEqual({ sameTicket: 0, sameScope: 0 })
  })
})

describe('fixRepeatText', () => {
  it('is null while the commit being made is under the limit', () => {
    expect(fixRepeatText({ sameTicket: 1, sameScope: 1 }, 3)).toBeNull()
  })

  it('warns on the third fix and names the root-cause skill', () => {
    const text = fixRepeatText({ sameTicket: 2, sameScope: 0 }, 3)
    expect(text).toContain('recurring-bug-root-cause')
    expect(text).toContain('ticket')
  })

  it('names the scope when only the scope repeats', () => {
    expect(fixRepeatText({ sameTicket: 0, sameScope: 4 }, 3)).toContain('scope')
  })
})

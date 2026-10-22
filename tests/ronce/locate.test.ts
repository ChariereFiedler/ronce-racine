import { describe, expect, it } from 'vitest'
import { policyCandidates } from '../../mods/ronce/src/policy/locate.ts'
import { expandHome } from '../../mods/ronce/src/policy/paths.ts'

describe('policyCandidates', () => {
  it('walks up from a subdirectory, nearest first', () => {
    expect(policyCandidates('/home/c/lab/granit-golem/backend').slice(0, 2)).toEqual([
      '/home/c/lab/granit-golem/backend/.claude/ronce.json',
      '/home/c/lab/granit-golem/.claude/ronce.json',
    ])
  })

  it('never looks at the filesystem root', () => {
    expect(policyCandidates('/a')).toEqual(['/a/.claude/ronce.json'])
  })
})

describe('expandHome', () => {
  it('expands a leading ~/ and leaves anything else', () => {
    expect(expandHome('~/.claude/ronce', '/home/c')).toBe('/home/c/.claude/ronce')
    expect(expandHome('/tmp/ronce', '/home/c')).toBe('/tmp/ronce')
    expect(expandHome('~/x', undefined)).toBe('~/x')
  })
})

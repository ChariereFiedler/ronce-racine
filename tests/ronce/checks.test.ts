import { describe, expect, it } from 'vitest'
import type { CheckSpec } from '../../mods/ronce/types'
import {
  backgroundRuns,
  changedPaths,
  checksForPath,
  expandRun,
  findingOf,
  parseEnv,
  reachTarget,
  reportText,
  scopeKey,
} from '../../mods/ronce/src/checks/plan.ts'

const spec = (over: Partial<CheckSpec>): CheckSpec => ({
  id: 'c', title: 'Check', match: '\\.rs$', run: ['tool', '{file}'], timeoutMs: 1000, maxLines: 5, ...over,
})

describe('checksForPath', () => {
  it('keeps the checks whose pattern matches the path, minus the excluded ones', () => {
    const specs = [spec({ id: 'rs' }), spec({ id: 'ts', match: '\\.ts$', unless: '\\.d\\.ts$' })]
    expect(checksForPath(specs, 'src/a.rs').map(s => s.id)).toEqual(['rs'])
    expect(checksForPath(specs, 'src/a.ts').map(s => s.id)).toEqual(['ts'])
    expect(checksForPath(specs, 'src/a.d.ts')).toEqual([])
  })
})

describe('expandRun', () => {
  it('fills the placeholders, spreading the file list into arguments', () => {
    expect(expandRun(['a', '{file}', '--', '{files}', 'crates/{group}/Cargo.toml', '{rel}'], {
      file: '/r/x.rs', rel: 'x.rs', group: 'core', files: ['/r/a.ts', '/r/b.ts'],
    })).toEqual(['a', '/r/x.rs', '--', '/r/a.ts', '/r/b.ts', 'crates/core/Cargo.toml', 'x.rs'])
  })
})

describe('findingOf', () => {
  it('reports a non-zero exit, clipped and without colours', () => {
    const body = findingOf(spec({ maxLines: 2 }), 1, '\u001b[31merror one\u001b[0m\nerror two\nerror three\n', [])
    expect(body).toBe('error one\nerror two\n… (1 ligne(s) retirée(s))')
    expect(findingOf(spec({}), 0, 'all good', [])).toBeNull()
  })

  it('uses findingWhen when the tool exits 0 even with findings', () => {
    const astGrep = spec({ findingWhen: 'error\\[' })
    expect(findingOf(astGrep, 0, 'error[rust-no-dbg]: dbg! left in', [])).toContain('rust-no-dbg')
    expect(findingOf(astGrep, 0, 'nothing', [])).toBeNull()
  })

  it('keeps the lines about the touched files, plus the hard errors when the command fails', () => {
    const clippy = spec({ onlyLinesMentioningFiles: true, alsoReportOnFailure: '(^|: )error(\\[|:)' })
    const output = 'src/a.rs:3:1: warning: unused\nsrc/b.rs:9:1: warning: other\nsrc/c.rs:1:1: error[E0308]: mismatched'
    expect(findingOf(clippy, 0, output, ['src/a.rs'])).toBe('src/a.rs:3:1: warning: unused')
    expect(findingOf(clippy, 101, output, ['src/a.rs'])).toBe('src/c.rs:1:1: error[E0308]: mismatched\nsrc/a.rs:3:1: warning: unused')
    expect(findingOf(clippy, 0, 'src/b.rs:9:1: warning: other', ['src/a.rs'])).toBeNull()
  })

  it('keeps only the lines that matter when asked', () => {
    const vitest = spec({ keepLinesMatching: 'FAIL|Tests ' })
    expect(findingOf(vitest, 1, 'noise\n FAIL a.test.ts\n Tests 1 failed', [])).toBe(' FAIL a.test.ts\n Tests 1 failed')
  })
})

describe('backgroundRuns', () => {
  it('runs once per group value, with the files of that group', () => {
    const clippy = spec({ id: 'clippy', match: '^backend/crates/[^/]+/.*\\.rs$', group: '^backend/crates/([^/]+)/' })
    const runs = backgroundRuns([clippy], ['backend/crates/api/src/a.rs', 'backend/crates/api/src/b.rs', 'backend/crates/core/x.rs', 'README.md'])
    expect(runs.map(r => [r.group, r.files])).toEqual([
      ['api', ['backend/crates/api/src/a.rs', 'backend/crates/api/src/b.rs']],
      ['core', ['backend/crates/core/x.rs']],
    ])
  })

  it('runs only when a matched file holds the content the check is about', () => {
    const sqlx = spec({ id: 'sqlx', match: '\\.rs$', onlyIfFilesContain: 'sqlx::query' })
    const contents: Record<string, string> = { 'a.rs': 'fn a() {}', 'b.rs': 'sqlx::query!("select 1")' }
    expect(backgroundRuns([sqlx], ['a.rs'], rel => contents[rel])).toEqual([])
    expect(backgroundRuns([sqlx], ['a.rs', 'b.rs'], rel => contents[rel]).map(r => r.files)).toEqual([['a.rs', 'b.rs']])
  })

  it('runs once with every matched file when there is no group, and not at all when nothing matches', () => {
    const tsc = spec({ id: 'tsc', match: '^scripts/.*\\.ts$' })
    expect(backgroundRuns([tsc], ['scripts/a.ts', 'scripts/b.ts']).map(r => r.files)).toEqual([['scripts/a.ts', 'scripts/b.ts']])
    expect(backgroundRuns([tsc], ['frontend/a.ts'])).toEqual([])
  })
})

describe('changedPaths and scopeKey', () => {
  it('reads git status --porcelain, renames included', () => {
    expect(changedPaths(' M src/a.rs\n?? new/file.ts\nR  old.ts -> renamed.ts\n')).toEqual(['src/a.rs', 'new/file.ts', 'renamed.ts'])
  })

  it('keys a scope on its files and their times, in any order', () => {
    expect(scopeKey([{ path: 'b', mtimeMs: 2 }, { path: 'a', mtimeMs: 1 }])).toBe(scopeKey([{ path: 'a', mtimeMs: 1 }, { path: 'b', mtimeMs: 2 }]))
    expect(scopeKey([{ path: 'a', mtimeMs: 1 }])).not.toBe(scopeKey([{ path: 'a', mtimeMs: 3 }]))
  })
})

describe('env and reachability', () => {
  it('reads every variable of an env file', () => {
    expect(parseEnv('# c\nA=1\nDATABASE_URL="postgres://u:p@db:6543/x"\n')).toEqual({ A: '1', DATABASE_URL: 'postgres://u:p@db:6543/x' })
  })

  it('takes the host and port of a connection string', () => {
    expect(reachTarget('postgres://u:p@db:6543/x', 5432)).toEqual({ host: 'db', port: 6543 })
    expect(reachTarget('postgres://u:p@localhost/x', 5432)).toEqual({ host: 'localhost', port: 5432 })
    expect(reachTarget('not a url', 5432)).toBeNull()
    expect(reachTarget('postgres://u:p@db;rm -rf x:5432/x', 5432)).toBeNull()
  })
})

describe('reportText', () => {
  it('lists each failing check under its title', () => {
    expect(reportText([{ title: 'clippy : api', body: 'warning: x' }])).toBe(
      'Quality-gates en échec sur le scope modifié, à corriger avant commit ou push :\n\n── clippy : api ──\nwarning: x',
    )
  })
})

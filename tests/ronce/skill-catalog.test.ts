import { describe, expect, it } from 'vitest'
import {
  catalogDir,
  catalogMatches,
  catalogText,
  mergeCatalogs,
  parseSkill,
} from '../../mods/ronce/src/features/skill-catalog.ts'
import { loadPolicy } from '../../mods/ronce/src/policy/load.ts'

const SKILL_MD = '---\nname: detection-sweep\ndescription: Use for a sweep - "lance un sweep", « balaye le projet ».\n---\n\nBody.\n'

describe('skill catalog', () => {
  it('takes the quoted triggers and the long words of the name, in lower case', () => {
    const skill = parseSkill('detection-sweep', SKILL_MD, 'ronce-racine')
    expect(skill).toEqual({
      name: 'detection-sweep',
      namespace: 'ronce-racine',
      triggers: ['lance un sweep', 'balaye le projet', 'detection', 'sweep'],
    })
  })

  it('reads a CRLF SKILL.md as well as an LF one', () => {
    const skill = parseSkill('detection-sweep', SKILL_MD.replace(/\n/g, '\r\n'))
    expect(skill?.triggers).toContain('lance un sweep')
  })

  it('skips a file without frontmatter or description', () => {
    expect(parseSkill('x', 'no frontmatter')).toBeNull()
    expect(parseSkill('x', '---\nname: x\n---\n')).toBeNull()
  })

  it('ranks by the number of triggers found and keeps at most max', () => {
    const skills = [
      { name: 'one-hit', triggers: ['sweep'] },
      { name: 'two-hits', namespace: 'ns', triggers: ['sweep', 'projet'] },
      { name: 'miss', triggers: ['zorglub'] },
    ]
    expect(catalogMatches(skills, 'Lance un SWEEP sur le projet', 3)).toEqual(['ns:two-hits', 'one-hit'])
    expect(catalogMatches(skills, 'lance un sweep sur le projet', 1)).toEqual(['ns:two-hits'])
    expect(catalogMatches(skills, 'rien à voir', 3)).toEqual([])
  })

  it('keeps the first skill of a name when two sources hold it', () => {
    const project = [{ name: 'audit-quality', triggers: ['projet'] }]
    const plugin = [
      { name: 'audit-quality', namespace: 'ronce-racine', triggers: ['plugin'] },
      { name: 'other', namespace: 'ronce-racine', triggers: [] },
    ]
    expect(mergeCatalogs([project, plugin]).map(s => s.namespace ?? 'local')).toEqual(['local', 'ronce-racine'])
    expect(mergeCatalogs([project, plugin])).toHaveLength(2)
  })

  it('words the reminder as a fact', () => {
    expect(catalogText(['ronce-racine:detection-sweep', 'local-skill'])).toBe(
      '<skill-reminder>\nSkills dont les déclencheurs figurent dans cette demande : ronce-racine:detection-sweep, local-skill.\n</skill-reminder>',
    )
  })

  it('resolves a source directory from the plugin root or the repository root', () => {
    expect(catalogDir('{pluginRoot}/../../skills', '/lab/rr/mods/ronce', '/repo', '/home/c')).toBe('/lab/rr/mods/ronce/../../skills')
    expect(catalogDir('.claude/skills', '/lab/rr/mods/ronce', '/repo', '/home/c')).toBe('/repo/.claude/skills')
    expect(catalogDir('~/skills', '/p', '/repo', '/home/c')).toBe('/home/c/skills')
  })
})

describe('skill catalog in the policy', () => {
  it('is on by default, with the project skills first and the plugin catalog next', () => {
    const { features } = loadPolicy([], null)
    expect(features.skillCatalog?.sources.map(s => s.dir)).toEqual(['.claude/skills', '{pluginRoot}/../../skills'])
    expect(features.skillCatalog?.max).toBe(3)
  })

  it('can be turned off', () => {
    expect(loadPolicy([], JSON.stringify({ version: 1, skillCatalog: null })).features.skillCatalog).toBeNull()
  })
})

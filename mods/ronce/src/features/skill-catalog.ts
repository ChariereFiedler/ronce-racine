import type { CatalogSkill } from '../../types'
import { expandHome } from '../policy/paths.ts'

/** Shorter triggers match too much incidental vocabulary to mean anything. */
const MIN_TRIGGER_LENGTH = 4
const PLUGIN_ROOT = '{pluginRoot}'

/** The quoted strings of a description ("…" or « … ») and the long words of the name, in lower case. */
function triggersOf(name: string, description: string): string[] {
  const quoted = [...description.matchAll(/"([^"]+)"|«\s*([^»]+?)\s*»/g)].map(m => m[1] ?? m[2] ?? '')
  return [...quoted, ...name.split('-')]
    .map(trigger => trigger.toLowerCase().trim())
    .filter(trigger => trigger.length >= MIN_TRIGGER_LENGTH)
}

/** A skill from its SKILL.md text; null without a frontmatter description. CRLF files read like LF ones. */
export function parseSkill(name: string, text: string, namespace?: string): CatalogSkill | null {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1]
  const description = frontmatter && /description:\s*([^\r\n]*)/.exec(frontmatter)?.[1]
  if (!description) return null
  return { name, ...(namespace ? { namespace } : {}), triggers: triggersOf(name, description) }
}

/** One skill per name, the first source holding it winning: a project's own copy outranks the plugin's. */
export function mergeCatalogs(catalogs: readonly CatalogSkill[][]): CatalogSkill[] {
  const seen = new Set<string>()
  return catalogs.flat().filter(skill => {
    if (seen.has(skill.name)) return false
    seen.add(skill.name)
    return true
  })
}

const qualifiedName = (skill: CatalogSkill): string => (skill.namespace ? `${skill.namespace}:${skill.name}` : skill.name)

/** The names of the skills with most triggers in the prompt, at most `max`, none when nothing matches. */
export function catalogMatches(skills: readonly CatalogSkill[], prompt: string, max: number): string[] {
  const text = prompt.toLowerCase()
  return skills
    .map(skill => ({ name: qualifiedName(skill), hits: skill.triggers.filter(trigger => text.includes(trigger)).length }))
    .filter(scored => scored.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, max)
    .map(scored => scored.name)
}

/** Worded as a fact: the model reads it as information, not as an order from a tool. */
export function catalogText(names: readonly string[]): string {
  return `<skill-reminder>\nSkills dont les déclencheurs figurent dans cette demande : ${names.join(', ')}.\n</skill-reminder>`
}

/** A source directory made absolute: `{pluginRoot}` and `~` expanded, anything else from the repository root. */
export function catalogDir(dir: string, pluginRoot: string, repoRoot: string, home: string | undefined): string {
  if (dir.startsWith(PLUGIN_ROOT)) return `${pluginRoot}${dir.slice(PLUGIN_ROOT.length)}`
  const expanded = expandHome(dir, home)
  return expanded.startsWith('/') ? expanded : `${repoRoot}/${expanded}`
}

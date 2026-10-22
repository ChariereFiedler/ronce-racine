import type { CheckSpec } from '../../types'

const ESCAPE = String.fromCharCode(27)
/** Terminal colour codes, which tools print even when piped and which the model has no use for. */
const ANSI = new RegExp(`${ESCAPE}\\[[0-9;]*m`, 'g')
const REPORT_HEADER = 'Quality-gates en échec sur le scope modifié, à corriger avant commit ou push :'

export function checksForPath(specs: readonly CheckSpec[], rel: string): CheckSpec[] {
  return specs.filter(spec => new RegExp(spec.match).test(rel) && !(spec.unless && new RegExp(spec.unless).test(rel)))
}

/** `{files}` alone spreads into one argument per file; `{file}`, `{rel}` and `{group}` are filled anywhere. */
export function expandRun(run: readonly string[], vars: { file?: string; rel?: string; group?: string; files?: string[] }): string[] {
  return run.flatMap(arg => {
    if (arg === '{files}') return vars.files ?? []
    return [arg.replaceAll('{file}', vars.file ?? '').replaceAll('{rel}', vars.rel ?? '').replaceAll('{group}', vars.group ?? '')]
  })
}

function clip(lines: readonly string[], maxLines: number): string {
  if (lines.length <= maxLines) return lines.join('\n')
  return [...lines.slice(0, maxLines), `… (${lines.length - maxLines} ligne(s) retirée(s))`].join('\n')
}

/** What the model needs to read of a check's output, or null when the check found nothing. */
export function findingOf(spec: CheckSpec, exitCode: number, output: string, files: readonly string[]): string | null {
  let lines = output.replace(ANSI, '').split('\n').filter(line => line.trim() !== '')
  if (spec.keepLinesMatching) {
    const keep = new RegExp(spec.keepLinesMatching)
    lines = lines.filter(line => keep.test(line))
  }
  if (spec.onlyLinesMentioningFiles) {
    const also = spec.alsoReportOnFailure && exitCode !== 0 ? new RegExp(spec.alsoReportOnFailure) : null
    const failing = also ? lines.filter(line => also.test(line)) : []
    const mentioned = lines.filter(line => files.some(file => line.includes(file)) && !failing.includes(line))
    const kept = [...failing, ...mentioned]
    return kept.length > 0 ? clip(kept, spec.maxLines) : null
  }
  const found = spec.findingWhen ? new RegExp(spec.findingWhen, 'm').test(output) : exitCode !== 0
  if (!found) return null
  return clip(lines.length > 0 ? lines : [`code de sortie ${exitCode}`], spec.maxLines)
}

export type BackgroundRun = { spec: CheckSpec; group?: string; files: string[] }

/**
 * The runs a set of changed files calls for: one per group value, or one with every matched file.
 * `contentOf` answers a changed file's text, for the checks that only run on some content.
 */
export function backgroundRuns(
  specs: readonly CheckSpec[],
  changed: readonly string[],
  contentOf: (rel: string) => string | undefined = () => undefined,
): BackgroundRun[] {
  return specs.flatMap(spec => {
    const matched = changed.filter(rel => checksForPath([spec], rel).length > 0)
    if (matched.length === 0) return []
    if (spec.onlyIfFilesContain) {
      const wanted = new RegExp(spec.onlyIfFilesContain, 'm')
      if (!matched.some(rel => wanted.test(contentOf(rel) ?? ''))) return []
    }
    if (!spec.group) return [{ spec, files: matched }]
    const pattern = new RegExp(spec.group)
    const byGroup = new Map<string, string[]>()
    for (const rel of matched) {
      const value = pattern.exec(rel)?.[1]
      if (value !== undefined) byGroup.set(value, [...(byGroup.get(value) ?? []), rel])
    }
    return [...byGroup].map(([group, files]) => ({ spec, group, files }))
  })
}

/** The paths `git status --porcelain` lists, a rename taken at its new name. */
export function changedPaths(porcelain: string): string[] {
  return porcelain
    .split('\n')
    .filter(line => line.length > 3)
    .map(line => line.slice(3).replace(/^.* -> /, '').replace(/^"|"$/g, ''))
}

/** Equal for the same files at the same times, whatever their order. */
export function scopeKey(entries: readonly { path: string; mtimeMs: number }[]): string {
  return entries
    .map(entry => `${entry.path}:${entry.mtimeMs}`)
    .sort()
    .join('\n')
}

export function parseEnv(text: string): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const assignment = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim())
    if (assignment) vars[assignment[1]!] = assignment[2]!.trim().replace(/^["']|["']$/g, '')
  }
  return vars
}

/**
 * The host and port of `scheme://user:pass@host:port/...`; null when the string holds none.
 * The host is limited to name characters: it ends up in a shell command that probes the port.
 */
export function reachTarget(url: string, defaultPort: number): { host: string; port: number } | null {
  const target = /@([A-Za-z0-9.-]+)(?::(\d+))?\//.exec(url)
  if (!target) return null
  return { host: target[1]!, port: target[2] ? Number(target[2]) : defaultPort }
}

export function reportText(failures: readonly { title: string; body: string }[]): string {
  return [REPORT_HEADER, ...failures.map(failure => `── ${failure.title} ──\n${failure.body}`)].join('\n\n')
}

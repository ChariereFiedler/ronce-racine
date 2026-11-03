import type { TicketConfig } from '../../types'
import type { BodyFormat, IssueCreation } from './issue-command.ts'

type Body = { body: string; labels: string[] }
/** What refuses the creation, and what keeps the mod from knowing whether it follows the form. */
export type TicketVerdict = { refusals: string[]; doubts: string[] }

const SEARCH_MISSING =
  'aucune recherche de doublon dans la session : lancer d\'abord gh issue list --search "<mots-clés>" (ou glab issue list --search)'
const CUT_COMMAND = 'commande trop longue, lue en partie'
/** Far above any ticket body; a larger file is not one. */
const MAX_BODY_BYTES = 256 * 1024
const SYSTEM_DIRS = /^\/(dev|proc|sys)\//

/** Whether the mod may read a body file before the command runs: a regular file, of ticket size, outside the system trees. */
export function isReadableBody(path: string, stat: { kind: string; size: number }): boolean {
  return stat.kind === 'file' && stat.size <= MAX_BODY_BYTES && !SYSTEM_DIRS.test(path)
}

/** The headings the body lacks; each must be a whole line, case and surrounding spaces aside. A choice is named whole. */
export function missingHeadings(body: string, headings: TicketConfig['headings']): string[] {
  const lines = new Set(body.split(/\r?\n/).map(line => line.trim().toLowerCase()))
  return headings
    .map(entry => (Array.isArray(entry) ? entry : [entry]))
    .filter(choice => !choice.some(heading => lines.has(heading.trim().toLowerCase())))
    .map(choice => choice.join(' | '))
}

function decodeFormValue(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '))
  } catch {
    // A value that is not valid URL encoding is taken as it stands.
    return value
  }
}

function formFields(text: string): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const pair of text.split('&')) {
    const eq = pair.indexOf('=')
    if (eq > 0) fields[pair.slice(0, eq)] = decodeFormValue(pair.slice(eq + 1))
  }
  return fields
}

function jsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

function labelsOf(value: unknown): string[] {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []
  return list.filter((label): label is string => typeof label === 'string').map(label => label.trim()).filter(Boolean)
}

function bodyOf(fields: Record<string, unknown>): Body {
  const body = fields.body ?? fields.description
  return { body: typeof body === 'string' ? body : '', labels: labelsOf(fields.labels ?? fields['labels[]']) }
}

/** The body and labels of a request body: a JSON object (GitHub `body`, GitLab `description`) or URL-encoded form fields. */
export function readPayload(text: string): Body {
  return bodyOf(jsonObject(text) ?? formFields(text))
}

/** One raw `key=value` field, as `curl --data-urlencode` takes it: nothing to decode. */
export function readField(text: string): Body {
  const eq = text.indexOf('=')
  return eq <= 0 ? { body: '', labels: [] } : bodyOf({ [text.slice(0, eq)]: text.slice(eq + 1) })
}

const READERS: Record<BodyFormat, (text: string) => Body> = {
  markdown: text => ({ body: text, labels: [] }),
  payload: readPayload,
  field: readField,
}

/** The body the creation sends, with the files it names read from `files`; what cannot be known is a doubt. */
function resolveBody(creation: IssueCreation, files: Readonly<Record<string, string>> | undefined): Body & { doubts: string[] } {
  const parts: Body[] = []
  const doubts: string[] = []
  for (const source of creation.bodies) {
    if (source.kind === 'unknown') doubts.push(source.reason)
    else if (source.kind === 'text') parts.push(READERS[source.format](source.text))
    else if (files?.[source.path] === undefined) doubts.push(`fichier non lu avant l'exécution : ${source.path}`)
    else parts.push(READERS[source.format](files[source.path]!))
  }
  return { body: parts.map(part => part.body).join('\n'), labels: [...creation.labels, ...parts.flatMap(part => part.labels)], doubts }
}

function creationVerdict(
  creation: IssueCreation,
  files: Readonly<Record<string, string>> | undefined,
  ticket: TicketConfig,
  isCut: boolean,
): TicketVerdict {
  const { body, labels, doubts } = resolveBody(creation, files)
  if (isCut) doubts.push(CUT_COMMAND)
  const refusals: string[] = []
  const missing = missingHeadings(body, ticket.headings)
  if (doubts.length === 0 && missing.length > 0) refusals.push(`en-têtes manquants : ${missing.join(', ')}`)
  const wanted = ticket.labels ?? []
  const carried = new Set(labels.map(label => label.toLowerCase()))
  const lacksLabel = wanted.length > 0 && !wanted.some(label => carried.has(label.toLowerCase()))
  // An unread payload may hold the labels: only then is a missing label a doubt rather than a refusal.
  const labelFinding = doubts.length > 0 && creation.labelsInBody ? doubts : refusals
  if (lacksLabel) labelFinding.push(`une étiquette parmi : ${wanted.join(' | ')}`)
  return { refusals, doubts }
}

/** What keeps the creations of a command from the project's ticket form, refusals and doubts apart, each said once. */
export function ticketVerdict(
  creations: readonly IssueCreation[],
  files: Readonly<Record<string, string>> | undefined,
  ticket: TicketConfig,
  context: { issuesSearched: boolean; isCut: boolean },
): TicketVerdict {
  const verdicts = creations.map(creation => creationVerdict(creation, files, ticket, context.isCut))
  const unsearched = ticket.requireSearch !== false && !context.issuesSearched && creations.some(creation => !creation.afterSearch)
  return {
    refusals: [...new Set([...(unsearched ? [SEARCH_MISSING] : []), ...verdicts.flatMap(v => v.refusals)])],
    doubts: [...new Set(verdicts.flatMap(v => v.doubts))],
  }
}

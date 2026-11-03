import type { TicketConfig } from '../../types'
import type { IssueCreation } from './issue-command.ts'

type Body = { body: string; labels: string[] }

const SEARCH_HINT = 'lancer d\'abord gh issue list --search "<mots-clés>" (ou glab issue list --search)'

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
    // Not URL-encoded (curl --data-urlencode encodes it on the way out): the value is the text.
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

/** The body and labels of a request body: a JSON object (GitHub `body`, GitLab `description`) or form fields. */
export function readPayload(text: string): Body {
  const fields = jsonObject(text) ?? formFields(text)
  const body = fields.body ?? fields.description
  return { body: typeof body === 'string' ? body : '', labels: labelsOf(fields.labels) }
}

/** The body the creation sends, with the files it names read from `files`; those missing there are `unread`. */
function resolveBody(creation: IssueCreation, files: Readonly<Record<string, string>> | undefined): Body & { unread: string[] } {
  const parts: Body[] = []
  const unread: string[] = []
  for (const source of creation.bodies) {
    const text = source.kind === 'text' ? source.text : files?.[source.path]
    if (text === undefined) unread.push(source.kind === 'file' ? source.path : '')
    else parts.push(source.format === 'payload' ? readPayload(text) : { body: text, labels: [] })
  }
  return {
    body: parts.map(part => part.body).join('\n'),
    labels: [...creation.labels, ...parts.flatMap(part => part.labels)],
    unread,
  }
}

/** What keeps an issue creation from the project's ticket form; empty when it follows it. */
export function ticketProblems(
  creation: IssueCreation,
  files: Readonly<Record<string, string>> | undefined,
  ticket: TicketConfig,
  issuesSearched: boolean,
): string[] {
  const { body, labels, unread } = resolveBody(creation, files)
  const problems: string[] = []
  if (ticket.requireSearch !== false && !issuesSearched) problems.push(`aucune recherche de doublon dans la session : ${SEARCH_HINT}`)
  const missing = missingHeadings(body, ticket.headings)
  if (unread.length > 0) problems.push(`corps illisible : ${unread.join(', ')}`)
  else if (missing.length > 0) problems.push(`en-têtes manquants : ${missing.join(', ')}`)
  const wanted = ticket.labels ?? []
  if (wanted.length > 0 && !wanted.some(label => labels.includes(label))) problems.push(`une étiquette parmi : ${wanted.join(' | ')}`)
  return problems
}

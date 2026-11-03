import { baseName } from './paths.ts'

/** `markdown` is the body itself; `payload` is a request body (JSON or form fields) that holds it. */
export type BodyFormat = 'markdown' | 'payload'
export type BodySource = { kind: 'text'; text: string; format: BodyFormat } | { kind: 'file'; path: string; format: BodyFormat }
/** What an issue creation command sends: where its body comes from, and the labels it sets on the command line. */
export type IssueCreation = { bodies: BodySource[]; labels: string[] }

type Token = { word: string } | { op: string }

const HEREDOC_START = /<<-?[ \t]*(['"]?)([A-Za-z_][\w.-]*)\1[^\n]*\n/g
const OPERATORS = ';&|\n'
const DOUBLE_QUOTE_ESCAPES = '"\\$`'
const ANSI_ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"' }
const ASSIGNMENT = /^[A-Za-z_]\w*=/
const ISSUES_PATH = /(^|\/)issues\/?$/
const FILE_SUBSTITUTION = /^\$\(\s*(?:cat\s+|<\s*)(['"]?)([^'"()<\s]+)\1\s*\)$/
const SEARCH_URL = /search\/issues|\/issues\?[^\s'"]*\b(search|q)=/
const SEARCH_FLAG = /^(--search|-S)(=|$)/
const CLI = {
  gh: { body: ['--body', '-b'], bodyFile: ['--body-file', '-F'], label: ['--label', '-l'] },
  glab: { body: ['--description', '-d'], bodyFile: [], label: ['--label', '-l'] },
} as const
const API_VALUE_FLAGS = new Set([
  '-X', '--method', '-f', '--raw-field', '-F', '--field', '-H', '--header', '--input', '-q', '--jq', '-t', '--template',
  '--hostname', '--cache', '-p', '--preview',
])
const BODY_FIELDS = new Set(['body', 'description'])
const LABEL_FIELDS = new Set(['labels', 'labels[]'])
const CURL_DATA_FLAGS = ['-d', '--data', '--data-raw', '--data-binary', '--data-urlencode', '--json', '-F', '--form']

const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The command without its heredoc bodies, and those bodies: they are the stdin of the command that opens them. */
function extractHeredocs(command: string): { rest: string; heredocs: string[] } {
  const heredocs: string[] = []
  let rest = command
  HEREDOC_START.lastIndex = 0
  for (let start = HEREDOC_START.exec(rest); start; start = HEREDOC_START.exec(rest)) {
    const bodyStart = start.index + start[0].length
    const end = new RegExp(`^[ \\t]*${escapeRegex(start[2]!)}[ \\t]*$`, 'm').exec(rest.slice(bodyStart))
    if (!end) continue
    heredocs.push(rest.slice(bodyStart, bodyStart + end.index).replace(/\n$/, ''))
    rest = rest.slice(0, bodyStart) + rest.slice(bodyStart + end.index + end[0].length)
    HEREDOC_START.lastIndex = bodyStart
  }
  return { rest, heredocs }
}

/** A quoted string from `open` on: its value and the index of its closing quote. */
function readQuoted(text: string, open: number): { value: string; close: number } {
  const quote = text[open]
  let value = ''
  let i = open + 1
  for (; i < text.length && text[i] !== quote; i++) {
    const escaped = text[i + 1] ?? ''
    if (text[i] === '\\' && quote === '"' && (DOUBLE_QUOTE_ESCAPES.includes(escaped) || escaped === '\n')) {
      value += escaped === '\n' ? '' : escaped
      i++
    } else value += text[i]
  }
  return { value, close: i }
}

/** A `$'…'` string from its `$`: its value, escapes decoded, and the index of its closing quote. */
function readAnsiQuoted(text: string, dollar: number): { value: string; close: number } {
  let value = ''
  let i = dollar + 2
  for (; i < text.length && text[i] !== "'"; i++) {
    if (text[i] === '\\') value += ANSI_ESCAPES[text[++i] ?? ''] ?? `\\${text[i] ?? ''}`
    else value += text[i]
  }
  return { value, close: i }
}

/** Shell words and operators, enough to read the flags of a command; comments are dropped. */
function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  let word: string | null = null
  const flush = (): void => {
    if (word !== null) tokens.push({ word })
    word = null
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (c === ' ' || c === '\t') flush()
    else if (c === '#' && word === null) {
      const lineEnd = text.indexOf('\n', i)
      i = lineEnd === -1 ? text.length : lineEnd - 1
    } else if (OPERATORS.includes(c) && !(c === '&' && word?.endsWith('>'))) {
      flush()
      tokens.push({ op: c })
    } else if (c === '\\') {
      const next = text[++i] ?? ''
      word = (word ?? '') + (next === '\n' ? '' : next)
    } else if (c === "'" || c === '"' || (c === '$' && text[i + 1] === "'")) {
      const quoted = c === '$' ? readAnsiQuoted(text, i) : readQuoted(text, i)
      word = (word ?? '') + quoted.value
      i = quoted.close
    } else word = (word ?? '') + c
  }
  flush()
  return tokens
}

function withoutAssignments(words: readonly string[]): string[] {
  const program = words.findIndex(word => !ASSIGNMENT.test(word))
  return program === -1 ? [] : words.slice(program)
}

/** The simple commands of a command line, each as its words, assignments in front left out. */
function simpleCommands(text: string): string[][] {
  const commands: string[][] = [[]]
  for (const token of tokenize(text)) {
    if ('op' in token) commands.push([])
    else commands[commands.length - 1]!.push(token.word)
  }
  return commands.map(withoutAssignments).filter(words => words.length > 0)
}

/** The values of a flag, in `--flag value` and `--flag=value` forms, in order. */
function flagValues(args: readonly string[], names: readonly string[]): string[] {
  const values: string[] = []
  args.forEach((arg, i) => {
    const eq = arg.indexOf('=')
    if (arg.startsWith('--') && eq > 0 && names.includes(arg.slice(0, eq))) values.push(arg.slice(eq + 1))
    else if (names.includes(arg) && i + 1 < args.length) values.push(args[i + 1]!)
  })
  return values
}

const splitLabels = (values: readonly string[]): string[] =>
  values.flatMap(value => value.split(',')).map(label => label.trim()).filter(label => label !== '')

const stdinSources = (heredocs: readonly string[], format: BodyFormat): BodySource[] =>
  heredocs.map(text => ({ kind: 'text', text, format }))

/** A `--body` value: inline text, `$(cat file)`, or `$(cat <<EOF … EOF)` whose heredoc holds the text. */
function inlineBody(value: string, heredocs: readonly string[]): BodySource[] {
  const file = FILE_SUBSTITUTION.exec(value)
  if (file) return [{ kind: 'file', path: file[2]!, format: 'markdown' }]
  if (value.startsWith('$(') && value.includes('<<')) return stdinSources(heredocs, 'markdown')
  return [{ kind: 'text', text: value, format: 'markdown' }]
}

/** A file argument: `-` (or `@-`) is stdin, here a heredoc; `@path` names a file as curl and `gh api -F` read it. */
function fileBody(value: string, format: BodyFormat, heredocs: readonly string[]): BodySource[] {
  const path = value.replace(/^@/, '')
  return path === '-' ? stdinSources(heredocs, format) : [{ kind: 'file', path, format }]
}

function cliCreation(program: keyof typeof CLI, args: readonly string[], heredocs: readonly string[]): IssueCreation {
  const flags = CLI[program]
  return {
    bodies: [
      ...flagValues(args, flags.body).flatMap(value => inlineBody(value, heredocs)),
      ...flagValues(args, flags.bodyFile).flatMap(value => fileBody(value, 'markdown', heredocs)),
    ],
    labels: splitLabels(flagValues(args, flags.label)),
  }
}

/** The endpoint of `gh api`/`glab api`: the first argument that is neither a flag nor a flag's value. */
function apiEndpoint(args: readonly string[]): string | undefined {
  return args.find((arg, i) => !arg.startsWith('-') && !API_VALUE_FLAGS.has(args[i - 1] ?? ''))
}

const withoutQuery = (url: string): string => url.split(/[?#]/)[0]!

function isPost(method: string | undefined, hasData: boolean): boolean {
  return method === undefined ? hasData : method.toUpperCase() === 'POST'
}

/** `key=value`; a pair without `=` is a key with no value. */
function fieldOf(pair: string): { key: string; value: string } {
  const eq = pair.indexOf('=')
  return eq === -1 ? { key: pair, value: '' } : { key: pair.slice(0, eq), value: pair.slice(eq + 1) }
}

/** `-f` fields are literal; `-F` fields read `@file` as a file, as `gh api` does. */
function apiFields(args: readonly string[], heredocs: readonly string[]): IssueCreation {
  const fields = [
    ...flagValues(args, ['-f', '--raw-field']).map(pair => ({ ...fieldOf(pair), isTyped: false })),
    ...flagValues(args, ['-F', '--field']).map(pair => ({ ...fieldOf(pair), isTyped: true })),
  ]
  const bodies = fields
    .filter(field => BODY_FIELDS.has(field.key))
    .flatMap(({ value, isTyped }) => (isTyped && value.startsWith('@') ? fileBody(value, 'markdown', heredocs) : inlineBody(value, heredocs)))
  const labels = splitLabels(fields.filter(field => LABEL_FIELDS.has(field.key)).map(field => field.value))
  return { bodies, labels }
}

function apiCreation(args: readonly string[], heredocs: readonly string[]): IssueCreation | null {
  const endpoint = apiEndpoint(args)
  if (!endpoint || !ISSUES_PATH.test(withoutQuery(endpoint))) return null
  const fields = apiFields(args, heredocs)
  const inputs = flagValues(args, ['--input'])
  const hasData = flagValues(args, ['-f', '--raw-field', '-F', '--field']).length + inputs.length > 0
  if (!isPost(flagValues(args, ['-X', '--method'])[0], hasData)) return null
  return { bodies: [...fields.bodies, ...inputs.flatMap(input => fileBody(input, 'payload', heredocs))], labels: fields.labels }
}

function curlCreation(args: readonly string[], heredocs: readonly string[]): IssueCreation | null {
  const url = args.find(arg => /^https?:\/\//.test(arg)) ?? flagValues(args, ['--url'])[0]
  const data = flagValues(args, CURL_DATA_FLAGS)
  if (!url || !ISSUES_PATH.test(withoutQuery(url))) return null
  if (!isPost(flagValues(args, ['-X', '--request'])[0], data.length > 0)) return null
  const bodies = data.flatMap((value): BodySource[] =>
    value.startsWith('@') ? fileBody(value, 'payload', heredocs) : [{ kind: 'text', text: value, format: 'payload' }],
  )
  return { bodies, labels: [] }
}

function creationOf(words: readonly string[], heredocs: readonly string[]): IssueCreation | null {
  const program = baseName(words[0] ?? '')
  const [sub, action] = words.slice(1)
  if (program === 'gh' || program === 'glab') {
    if (sub === 'issue' && (action === 'create' || (program === 'glab' && action === 'new'))) return cliCreation(program, words.slice(3), heredocs)
    if (sub === 'api') return apiCreation(words.slice(2), heredocs)
  }
  return program === 'curl' ? curlCreation(words.slice(1), heredocs) : null
}

/** The issue a command creates (gh, glab, their `api`, curl on an issues endpoint); null for any other command. */
export function issueCreation(command: string): IssueCreation | null {
  const { rest, heredocs } = extractHeredocs(command)
  for (const words of simpleCommands(rest)) {
    const creation = creationOf(words, heredocs)
    if (creation) return creation
  }
  return null
}

/** The files an issue creation reads its body from, as written in the command; none for any other command. */
export function bodyFiles(command: string): string[] {
  return issueCreation(command)?.bodies.flatMap(source => (source.kind === 'file' ? [source.path] : [])) ?? []
}

/** A keyword search of the tracker's issues, the duplicate check a new issue calls for; a plain listing is not one. */
export function isIssueSearch(command: string): boolean {
  if (SEARCH_URL.test(command)) return true
  return simpleCommands(extractHeredocs(command).rest).some(words => {
    const program = baseName(words[0] ?? '')
    const [sub, action] = words.slice(1)
    if (program === 'gh' && sub === 'search' && action === 'issues') return true
    return (program === 'gh' || program === 'glab') && sub === 'issue' && action === 'list' && words.some(word => SEARCH_FLAG.test(word))
  })
}

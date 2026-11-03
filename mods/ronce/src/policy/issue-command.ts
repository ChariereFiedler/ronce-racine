import { baseName } from './paths.ts'

/**
 * `markdown` is the body itself; `payload` a request body (JSON or URL-encoded form) that holds it;
 * `field` one raw `key=value` form field, as `curl --data-urlencode` sends it before encoding.
 */
export type BodyFormat = 'markdown' | 'payload' | 'field'
/** Where a body comes from; `unknown` when only the shell, at run time, can tell. */
export type BodySource =
  | { kind: 'text'; text: string; format: BodyFormat }
  | { kind: 'file'; path: string; format: BodyFormat }
  | { kind: 'unknown'; reason: string }
/**
 * One issue creation: its body sources, the labels read on the command line, whether its request body may
 * carry labels too (an API call), and whether a search ran before it in the same command.
 */
export type IssueCreation = { bodies: BodySource[]; labels: string[]; labelsInBody: boolean; afterSearch: boolean }

type Token = { word: string } | { op: string }
type Heredocs = readonly string[]

const HEREDOC_MARKER = /<<(-?)[ \t]*(['"]?)([A-Za-z_][\w.-]*)\2/g
const HEREDOC_REF = /__RONCE_HEREDOC_(\d+)__/
const OPERATORS = ';&|()\n'
const DOUBLE_QUOTE_ESCAPES = '"\\$`'
const ANSI_ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"' }
const ASSIGNMENT = /^[A-Za-z_]\w*=/
/** What the shell expands at run time: a substitution, a variable, a backtick; a lone `$` is what an unquoted `$(` leaves. */
const DYNAMIC = /\$[({A-Za-z_0-9]|\$$|`/
const HEREDOC_WORD = /^__RONCE_HEREDOC_\d+__$/
const FILE_SUBSTITUTION = /^\$\(\s*(?:cat\s+|<\s*)([^\s()<$`]+)\s*\)$/
const STDIN_PATHS = new Set(['-', '/dev/stdin'])
const ISSUES_PATH = /(^|\/)issues\/?$/
const SEARCH_ENDPOINT = /(^|\/)search\/issues\b|\/issues\?([^#]*&)?search=/
const SEARCH_FLAG = /^(--search|-S)(=|$)/
const PREFIX_WORDS = new Set(['then', 'do', 'else', 'elif', '{', '!', 'time', 'command', 'exec', 'nohup', 'xargs', 'sudo'])
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash'])
const FORGES = new Set(['gh', 'glab'])
const REPO_FLAGS = ['-R', '--repo']
const REDIRECTS = /^(?:\d?>>?|&>)(.*)$/
const CLI = {
  gh: { body: ['--body', '-b'], bodyFile: ['--body-file', '-F'], label: ['--label', '-l'] },
  glab: { body: ['--description', '-d'], bodyFile: [], label: ['--label', '-l'] },
} as const
const INTERACTIVE_FLAGS = ['--web', '-w', '--editor', '-e', '--template', '-T']
const API_VALUE_FLAGS = new Set([
  '-X', '--method', '-f', '--raw-field', '-F', '--field', '-H', '--header', '--input', '-q', '--jq', '-t', '--template',
  '--hostname', '--cache', '-p', '--preview',
])
const BODY_FIELDS = new Set(['body', 'description'])
const LABEL_FIELDS = new Set(['labels', 'labels[]'])
const CURL_PAYLOAD_FLAGS = new Set(['-d', '--data', '--data-binary', '--json'])
const CURL_LITERAL_FLAGS = new Set(['--data-raw'])
const CURL_URLENCODE_FLAG = '--data-urlencode'

const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const placeholder = (index: number): string => `__RONCE_HEREDOC_${index}__`
const unknownBody = (reason: string): BodySource => ({ kind: 'unknown', reason })

/** The command with each heredoc replaced by a placeholder word, and the heredoc texts, so each stays with its own command. */
function extractHeredocs(command: string): { rest: string; heredocs: string[] } {
  const heredocs: string[] = []
  let rest = command
  HEREDOC_MARKER.lastIndex = 0
  for (let marker = HEREDOC_MARKER.exec(rest); marker; marker = HEREDOC_MARKER.exec(rest)) {
    const markerEnd = marker.index + marker[0].length
    const bodyStart = rest.indexOf('\n', markerEnd) + 1
    if (bodyStart === 0) break
    const indent = marker[1] === '-' ? '\\t*' : ''
    const end = new RegExp(`^${indent}${escapeRegex(marker[3]!)}$`, 'm').exec(rest.slice(bodyStart))
    if (!end) continue
    const word = ` ${placeholder(heredocs.length)} `
    heredocs.push(rest.slice(bodyStart, bodyStart + end.index).replace(/\n$/, ''))
    rest = rest.slice(0, marker.index) + word + rest.slice(markerEnd, bodyStart) + rest.slice(bodyStart + end.index + end[0].length)
    HEREDOC_MARKER.lastIndex = marker.index + word.length
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

/** The words from the program on: assignments, keywords and wrappers (`env`, `timeout 20`, `sudo`) left out. */
function programWords(words: readonly string[]): string[] {
  let rest = withoutAssignments(words)
  for (let head = rest[0]; head !== undefined; head = rest[0]) {
    if (PREFIX_WORDS.has(head)) rest = withoutAssignments(rest.slice(1))
    else if (head === 'env') rest = withoutAssignments(rest.slice(1))
    else if (head === 'timeout') rest = rest.slice(2)
    else break
  }
  return rest
}

/** The forge subcommand words, its global `-R`/`--repo` flag left out. */
function forgeArgs(args: readonly string[]): string[] {
  const rest = [...args]
  while (rest[0] !== undefined && (REPO_FLAGS.includes(rest[0]) || rest[0].startsWith('--repo='))) rest.splice(0, rest[0].includes('=') ? 1 : 2)
  return rest
}

/** The simple commands of a command line, each as its program and arguments; `sh -c '…'` is opened. */
function simpleCommands(text: string): string[][] {
  const lines: string[][] = [[]]
  for (const token of tokenize(text)) {
    if ('op' in token) lines.push([])
    else lines[lines.length - 1]!.push(token.word)
  }
  return lines.map(programWords).flatMap(words => {
    const scriptAt = words.indexOf('-c') + 1
    const script = SHELLS.has(baseName(words[0] ?? '')) && scriptAt > 0 ? words[scriptAt] : undefined
    return script === undefined ? [words] : simpleCommands(script)
  }).filter(words => words.length > 0)
}

/** The values of a flag: `--flag value`, `--flag=value`, and `-xvalue` for a short one. */
function flagValues(args: readonly string[], names: readonly string[]): string[] {
  const values: string[] = []
  args.forEach((arg, i) => {
    const eq = arg.indexOf('=')
    const short = names.find(name => name.length === 2 && arg.length > 2 && arg.startsWith(name) && !arg.startsWith('--'))
    if (arg.startsWith('--') && eq > 0 && names.includes(arg.slice(0, eq))) values.push(arg.slice(eq + 1))
    else if (names.includes(arg) && i + 1 < args.length) values.push(args[i + 1]!)
    else if (short) values.push(arg.slice(2))
  })
  return values
}

const splitLabels = (values: readonly string[]): string[] =>
  values.flatMap(value => value.split(',')).map(label => label.trim()).filter(label => label !== '')

function heredocIn(value: string, heredocs: Heredocs): string | undefined {
  const ref = HEREDOC_REF.exec(value)
  return ref ? heredocs[Number(ref[1])] : undefined
}

/** A `--body` value: inline text, `$(cat file)`, a heredoc behind `$(cat <<EOF)`, or unknown when the shell builds it. */
function inlineBody(value: string, heredocs: Heredocs, format: BodyFormat = 'markdown'): BodySource {
  const heredoc = heredocIn(value, heredocs)
  if (heredoc !== undefined) return { kind: 'text', text: heredoc, format }
  const file = FILE_SUBSTITUTION.exec(value)
  if (file) return { kind: 'file', path: file[1]!, format }
  return DYNAMIC.test(value) ? unknownBody(`corps construit par le shell : ${value.slice(0, 40)}`) : { kind: 'text', text: value, format }
}

/** A file argument: stdin is the command's own heredoc, if any; `@path` names a file as curl and `gh api -F` read it. */
function fileBody(value: string, format: BodyFormat, stdin: string | undefined): BodySource {
  const path = value.replace(/^@/, '')
  if (STDIN_PATHS.has(path)) return stdin === undefined ? unknownBody('corps lu sur l’entrée standard') : { kind: 'text', text: stdin, format }
  return DYNAMIC.test(path) ? unknownBody(`chemin construit par le shell : ${path}`) : { kind: 'file', path, format }
}

type Parsed = { bodies: BodySource[]; labels: string[]; labelsInBody?: true }

function cliCreation(program: 'gh' | 'glab', args: readonly string[], heredocs: Heredocs, stdin: string | undefined): Parsed {
  const flags = CLI[program]
  const bodies = [
    ...flagValues(args, flags.body).map(value => inlineBody(value, heredocs)),
    ...flagValues(args, flags.bodyFile).map(value => fileBody(value, 'markdown', stdin)),
  ]
  const isInteractive = args.some(arg => INTERACTIVE_FLAGS.includes(arg.split('=')[0]!))
  return { bodies: bodies.length === 0 && isInteractive ? [unknownBody('création interactive')] : bodies, labels: splitLabels(flagValues(args, flags.label)) }
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
function apiCreation(args: readonly string[], heredocs: Heredocs, stdin: string | undefined): Parsed | null {
  const endpoint = apiEndpoint(args)
  if (!endpoint || !ISSUES_PATH.test(withoutQuery(endpoint))) return null
  const fields = [
    ...flagValues(args, ['-f', '--raw-field']).map(pair => ({ ...fieldOf(pair), isTyped: false })),
    ...flagValues(args, ['-F', '--field']).map(pair => ({ ...fieldOf(pair), isTyped: true })),
  ]
  const inputs = flagValues(args, ['--input'])
  if (!isPost(flagValues(args, ['-X', '--method'])[0], fields.length + inputs.length > 0)) return null
  const bodies = fields
    .filter(field => BODY_FIELDS.has(field.key))
    .map(({ value, isTyped }) => (isTyped && value.startsWith('@') ? fileBody(value, 'markdown', stdin) : inlineBody(value, heredocs)))
  const labels = splitLabels(fields.filter(field => LABEL_FIELDS.has(field.key)).map(field => field.value))
  return { bodies: [...bodies, ...inputs.map(input => fileBody(input, 'payload', stdin))], labels, labelsInBody: true }
}

/** One `curl --data-urlencode` value: `name@file` sends the file as that field, `name=text` the raw text. */
function urlencodedBody(value: string, heredocs: Heredocs, stdin: string | undefined): BodySource | null {
  const named = /^([\w[\]]*)@(.+)$/.exec(value)
  if (named) return BODY_FIELDS.has(named[1]!) ? fileBody(named[2]!, 'markdown', stdin) : null
  return inlineBody(value, heredocs, 'field')
}

/** One curl data argument, by its flag; null for a flag that sends no data. */
function curlData(flag: string, value: string, heredocs: Heredocs, stdin: string | undefined): BodySource | null {
  if (flag === CURL_URLENCODE_FLAG) return urlencodedBody(value, heredocs, stdin)
  if (CURL_LITERAL_FLAGS.has(flag)) return inlineBody(value, heredocs, 'payload')
  if (!CURL_PAYLOAD_FLAGS.has(flag)) return null
  return value.startsWith('@') ? fileBody(value, 'payload', stdin) : inlineBody(value, heredocs, 'payload')
}

function curlCreation(args: readonly string[], heredocs: Heredocs, stdin: string | undefined): Parsed | null {
  const url = args.find(arg => /^https?:\/\//.test(arg)) ?? flagValues(args, ['--url'])[0]
  if (!url || !ISSUES_PATH.test(withoutQuery(url))) return null
  const data = args.flatMap((flag, i) => {
    const value = args[i + 1]
    const source = value === undefined ? null : curlData(flag, value, heredocs, stdin)
    return source ? [source] : []
  })
  if (!isPost(flagValues(args, ['-X', '--request'])[0], data.length > 0)) return null
  return { bodies: data, labels: [], labelsInBody: true }
}

/** The heredoc a simple command reads on stdin: the one whose placeholder stands among its words. */
function stdinOf(words: readonly string[], heredocs: Heredocs): string | undefined {
  const ref = words.find(word => HEREDOC_WORD.test(word))
  return ref === undefined ? undefined : heredocIn(ref, heredocs)
}

function creationOf(words: readonly string[], heredocs: Heredocs): Parsed | null {
  const program = baseName(words[0] ?? '')
  const stdin = stdinOf(words, heredocs)
  if (program === 'curl') return curlCreation(words.slice(1), heredocs, stdin)
  if (program !== 'gh' && program !== 'glab') return null
  const [sub, action, ...args] = forgeArgs(words.slice(1))
  if (sub === 'issue' && (action === 'create' || (program === 'glab' && action === 'new'))) return cliCreation(program, args, heredocs, stdin)
  return sub === 'api' && action !== undefined ? apiCreation([action, ...args], heredocs, stdin) : null
}

function isSearch(words: readonly string[]): boolean {
  const program = baseName(words[0] ?? '')
  if (program === 'curl') return words.some(word => /^https?:\/\//.test(word) && SEARCH_ENDPOINT.test(word))
  if (!FORGES.has(program)) return false
  const [sub, action, ...args] = forgeArgs(words.slice(1))
  if (program === 'gh' && sub === 'search' && action === 'issues') return true
  if (sub === 'issue' && action === 'list') return args.some(arg => SEARCH_FLAG.test(arg))
  const endpoint = sub === 'api' && action !== undefined ? apiEndpoint([action, ...args]) : undefined
  return endpoint !== undefined && SEARCH_ENDPOINT.test(endpoint)
}

/** Paths a command line writes through a redirection or `tee`. */
function writtenPaths(commands: readonly string[][]): Set<string> {
  const paths = new Set<string>()
  for (const words of commands) {
    words.forEach((word, i) => {
      const redirect = REDIRECTS.exec(word)
      if (redirect) paths.add(redirect[1] || (words[i + 1] ?? ''))
    })
    if (baseName(words[0] ?? '') === 'tee') for (const arg of words.slice(1)) if (!arg.startsWith('-')) paths.add(arg)
  }
  return paths
}

/** A body file the same command line writes holds, when it is read, what the line has not written yet. */
function withoutPendingFiles(bodies: readonly BodySource[], written: ReadonlySet<string>): BodySource[] {
  return bodies.map(body => (body.kind === 'file' && written.has(body.path) ? unknownBody(`fichier écrit par la même commande : ${body.path}`) : body))
}

/** Every issue a command creates (gh, glab, their `api`, curl on an issues endpoint), in order. */
export function issueCreations(command: string): IssueCreation[] {
  const { rest, heredocs } = extractHeredocs(command)
  const commands = simpleCommands(rest)
  const written = writtenPaths(commands)
  const creations: IssueCreation[] = []
  let hasSearched = false
  for (const words of commands) {
    const parsed = creationOf(words, heredocs)
    if (parsed) {
      const bodies = withoutPendingFiles(parsed.bodies, written)
      creations.push({ bodies, labels: parsed.labels, labelsInBody: parsed.labelsInBody ?? false, afterSearch: hasSearched })
    }
    hasSearched ||= isSearch(words)
  }
  return creations
}

/** The files an issue creation reads its body from, as written in the command; none for any other command. */
export function bodyFiles(command: string): string[] {
  return issueCreations(command).flatMap(creation => creation.bodies.flatMap(source => (source.kind === 'file' ? [source.path] : [])))
}

/** A keyword search of the tracker's issues, the duplicate check a new issue calls for; a plain listing is not one. */
export function isIssueSearch(command: string): boolean {
  return simpleCommands(extractHeredocs(command).rest).some(isSearch)
}

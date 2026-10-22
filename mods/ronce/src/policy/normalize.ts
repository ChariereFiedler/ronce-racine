/** A leading `cd X` or `export K=V`, then `&&` or `;`: it changes neither what is read nor what is written. */
const LEADING_NOISE =
  /^\s*(?:cd\s+(?:"[^"]*"|'[^']*'|[^\s;&|]+)|export\s+[A-Za-z_]\w*=(?:"[^"]*"|'[^']*'|[^\s;&|]*))\s*(?:&&|;)\s*/
const CD_TARGET = /^\s*cd\s+("[^"]*"|'[^']*'|[^\s;&|]+)/
const LEADING_CD = /^\s*cd\s+("[^"]*"|'[^']*'|[^\s;&|]+)\s*(?:&&|;)\s*/
/** `git -C <path>` picks the repository, not the subcommand: rules written for `git commit` must see one. */
const GIT_DIRECTORY_OPTION = /\bgit\s+-C\s+(?:"[^"]*"|'[^']*'|\S+)\s+/g
const ALLOW_MARKER = /#\s*ronce:allow\s+([\w-]+(?:[\s,]+[\w-]+)*)/g
const LEGACY_READ_GUARD_BYPASS = /#\s*no-read-guard/
const LEGACY_READ_GUARD_RULES = ['shell-read', 'heredoc-create']

export type NormalizedCommand = {
  normalized: string
  cwdTarget: string | null
  allowed: string[]
}

const unquote = (value: string): string => value.replace(/^["']|["']$/g, '')
const withoutTrailingSlash = (path: string): string => path.replace(/\/+$/, '')

export function normalizeCommand(command: string): NormalizedCommand {
  let rest = command
  let cwdTarget: string | null = null
  for (let noise = LEADING_NOISE.exec(rest); noise; noise = LEADING_NOISE.exec(rest)) {
    const cd = CD_TARGET.exec(noise[0])
    if (cd) cwdTarget = unquote(cd[1]!)
    rest = rest.slice(noise[0].length)
  }
  return { normalized: rest.replace(GIT_DIRECTORY_OPTION, 'git '), cwdTarget, allowed: allowedRuleIds(command) }
}

/** Rule ids lifted by `# ronce:allow a, b`; the legacy `# no-read-guard` lifts the two shell rules. */
export function allowedRuleIds(command: string): string[] {
  const ids = [...command.matchAll(ALLOW_MARKER)].flatMap(marker => marker[1]!.split(/[\s,]+/))
  return LEGACY_READ_GUARD_BYPASS.test(command) ? [...ids, ...LEGACY_READ_GUARD_RULES] : ids
}

/** `command` without its leading `cd <cwd> &&|;`, or null when it does not start with one. */
export function stripCdToCwd(command: string, cwd: string): string | null {
  const cd = LEADING_CD.exec(command)
  if (!cd) return null
  const rest = command.slice(cd[0].length)
  const isSameDirectory = withoutTrailingSlash(unquote(cd[1]!)) === withoutTrailingSlash(cwd)
  return isSameDirectory && rest.trim() !== '' ? rest : null
}

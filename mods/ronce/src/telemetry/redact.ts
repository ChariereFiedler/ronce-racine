const SECRET_ASSIGNMENT = /\b([A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|API_KEY|PRIVATE_KEY)[A-Z0-9_]*)=("[^"]*"|'[^']*'|\S+)/g
const SECRET_HEADER = /\b(PRIVATE-TOKEN|Authorization):\s*(?:Bearer\s+)?[^\s"']+/gi
/** `scheme://user:password@host`: a connection string carries its password in clear. */
const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/:@]+:[^\s/@]+@/gi
// Joined at load time so that the GitLab prefix never appears whole in this source: secret scanners flag it.
const GITLAB_TOKEN_SHAPE = ['glpat', '[\\w-]{10,}'].join('-')
const SECRET_VALUE = new RegExp(
  `\\b(?:${GITLAB_TOKEN_SHAPE}|gh[pousr]_\\w{20,}|sk-[\\w-]{20,}|xox[abprs]-[\\w-]{10,}|AKIA[0-9A-Z]{16}|re_[A-Za-z0-9_]{20,})`,
  'g',
)

/** Masks the secrets a command line commonly carries before it is buffered or stored. */
export function redact(text: string): string {
  return text
    .replace(SECRET_ASSIGNMENT, '$1=***')
    .replace(SECRET_HEADER, (_match, name: string) => `${name}: ***`)
    .replace(URL_CREDENTIALS, '$1***@')
    .replace(SECRET_VALUE, '***')
}

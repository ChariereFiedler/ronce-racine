const POLICY_FILE = '.claude/ronce.json'
/** Enough for a session started deep in a monorepo, short of walking the whole disk. */
const MAX_LEVELS = 8

/** `<cwd>/.claude/ronce.json`, then the same in each parent directory, nearest first. */
export function policyCandidates(cwd: string): string[] {
  const parts = cwd.replace(/\/+$/, '').split('/')
  const candidates: string[] = []
  for (let depth = parts.length; depth > 1 && candidates.length < MAX_LEVELS; depth--) {
    candidates.push(`${parts.slice(0, depth).join('/')}/${POLICY_FILE}`)
  }
  return candidates
}

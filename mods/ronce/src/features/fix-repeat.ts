export type FixKey = { scope: string | null; ticket: string | null }
export type HistoryEntry = { subject: string; ageHours: number }
export type RepeatCounts = { sameTicket: number; sameScope: number }

const FIX_SUBJECT = /^fix(?:\(([^)]*)\))?!?:/
const COMMIT_MESSAGE = /\bgit\s+commit\b[^|;&]*?\s-m\s+(["'])(.*?)\1/s

/** First line of the first `-m` message of a `git commit` command; null when the message is not in the command. */
export function commitSubject(command: string): string | null {
  const message = COMMIT_MESSAGE.exec(command)?.[2]
  return message === undefined ? null : (message.split('\n')[0] ?? null)
}
const TICKET = /#(\d+)|\b(T-[A-Z0-9]{4,})\b/

/** Scope and ticket of a `fix` commit subject; null when the subject is not a fix. */
export function parseFixSubject(subject: string): FixKey | null {
  const fix = FIX_SUBJECT.exec(subject)
  if (!fix) return null
  const ticket = TICKET.exec(subject)
  return { scope: fix[1] ?? null, ticket: ticket ? (ticket[1] ?? ticket[2] ?? null) : null }
}

/** Earlier fixes inside the window that name the same ticket, and the same scope, as the one being committed. */
export function countRepeats(history: readonly HistoryEntry[], candidate: FixKey, windowHours: number): RepeatCounts {
  const counts: RepeatCounts = { sameTicket: 0, sameScope: 0 }
  for (const entry of history) {
    if (entry.ageHours > windowHours) continue
    const fix = parseFixSubject(entry.subject)
    if (!fix) continue
    if (candidate.ticket !== null && fix.ticket === candidate.ticket) counts.sameTicket++
    if (candidate.scope !== null && fix.scope === candidate.scope) counts.sameScope++
  }
  return counts
}

/** The warning once the fix being committed reaches `limit` on one ticket or scope (earlier fixes + this one); null before. */
export function fixRepeatText(counts: RepeatCounts, limit: number): string | null {
  const onTicket = counts.sameTicket + 1 >= limit
  const onScope = counts.sameScope + 1 >= limit
  if (!onTicket && !onScope) return null
  const subject = onTicket ? `ce ticket (${counts.sameTicket + 1} fix)` : `ce scope (${counts.sameScope + 1} fix)`
  return `Fix répété sur ${subject} en peu de temps : une correction de plus ne dit pas pourquoi les précédentes n'ont pas suffi. Appliquer le skill recurring-bug-root-cause avant d'écrire la suivante.`
}

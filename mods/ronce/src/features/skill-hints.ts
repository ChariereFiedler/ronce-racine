import type { SkillHint, TicketConfig } from '../../types'

/** A prompt about writing a ticket, in French or English. */
const TICKET_PROMPT = /\b(tickets?|issues?|bug reports?|rapport de bug)\b/i
const GENERIC_TICKET_SKILL = 'ronce-racine:bug-ticket-root-cause'

/** Names the project's ticket skill, then the generic bug ticket one, when the prompt is about a ticket. */
export function ticketHint(ticket: TicketConfig | null, prompt: string): string | null {
  if (!ticket || !TICKET_PROMPT.test(prompt)) return null
  return [
    '<skill-reminder>',
    `Cette demande parle d'un ticket. Le skill de rédaction de tickets du projet est \`${ticket.skill}\` : il fixe les sections du corps, à charger avant d'écrire l'issue.`,
    `Pour un bug, \`${GENERIC_TICKET_SKILL}\` vient ensuite, pour établir la cause.`,
    '</skill-reminder>',
  ].join('\n')
}

/** The first hint whose pattern matches the prompt, ignoring case. */
export function hintFor(hints: readonly SkillHint[], prompt: string): SkillHint | null {
  return hints.find(hint => new RegExp(hint.pattern, 'i').test(prompt)) ?? null
}

/** Worded as a fact: the model reads it as information, not as an order from a tool. */
export function hintText(hint: SkillHint): string {
  const lines = [
    '<skill-reminder>',
    `Le skill \`${hint.skill}\` correspond à cette demande (${hint.reason}).`,
    ...(hint.note ? [hint.note] : []),
    '</skill-reminder>',
  ]
  return lines.join('\n')
}

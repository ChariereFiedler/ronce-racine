const INTENT_CHARS = 600

export function ticketFrom(branch: string, pattern: string): string | null {
  return new RegExp(pattern).exec(branch)?.[1] ?? null
}

const quote = (text: string): string => `> ${text.replace(/\n/g, '\n> ')}`

/** The note appended after a compaction, so the summary does not lose where the session stood. */
export function memoText(args: {
  branch: string
  ticket: string | null
  lastIntent: string | null
  decisions?: { file: string; ageDays: number; staleDays: number }
}): string {
  const ticket = args.ticket ? ` (ticket #${args.ticket})` : ''
  const sections = [
    '## Contexte de session (ronce, après compaction)',
    `**Branche :** \`${args.branch}\`${ticket}`,
  ]
  if (args.lastIntent) sections.push(`## Dernière intention utilisateur\n${quote(args.lastIntent.slice(0, INTENT_CHARS))}`)
  const decisions = args.decisions
  if (decisions && decisions.ageDays >= decisions.staleDays) {
    sections.push(
      `## ${decisions.file} non mis à jour depuis ${decisions.ageDays} jours\n` +
        `> Aucune décision architecturale tracée depuis ${decisions.ageDays} jours ; /record-decision si des choix importants ont été faits.`,
    )
  }
  return `${sections.join('\n\n')}\n`
}

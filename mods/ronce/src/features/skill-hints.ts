import type { SkillHint } from '../../types'

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

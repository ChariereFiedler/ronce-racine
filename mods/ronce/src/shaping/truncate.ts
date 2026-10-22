import type { ShapingConfig } from '../../types'

export type ShapingPlan = { text: string; originalChars: number; keptChars: number }

/**
 * The head and tail of a long successful output, and where the whole of it is kept;
 * null when the output is short, or has too few lines to cut without losing a line in its middle.
 */
export function planShaping(output: string, cfg: ShapingConfig, fullOutputPath: string): ShapingPlan | null {
  if (output.length <= cfg.maxChars) return null
  const lines = output.split('\n')
  if (lines.length <= cfg.headLines + cfg.tailLines) return null
  const omitted = lines.length - cfg.headLines - cfg.tailLines
  const text = [
    ...lines.slice(0, cfg.headLines),
    '',
    `… [${omitted} lignes retirées sur ${lines.length} · sortie complète : ${fullOutputPath}] …`,
    '',
    ...lines.slice(-cfg.tailLines),
  ].join('\n')
  return { text, originalChars: output.length, keptChars: text.length }
}

export function fullOutputPath(dir: string, sessionId: string, toolUseId: string): string {
  return `${dir}/${sessionId}/${toolUseId}.log`
}

import type { ContextSignalConfig } from '../../types'

/** From this threshold up, the wording asks for the handoff now instead of suggesting it. */
const STRONG_FROM_PERCENT = 75

/** The highest threshold at or below `percent` that has not fired yet; null when none, or when the percent is unknown. */
export function crossedThreshold(percent: number | undefined, fired: readonly number[], thresholds: readonly number[]): number | null {
  if (percent === undefined) return null
  const pending = thresholds.filter(threshold => threshold <= percent && !fired.includes(threshold))
  return pending.length === 0 ? null : Math.max(...pending)
}

/** After a compaction the percent falls: thresholds above it fire again when the context grows back. */
export function rearmed(percent: number | undefined, fired: readonly number[]): number[] {
  if (percent === undefined) return [...fired]
  return fired.filter(threshold => threshold <= percent)
}

/** The line added to the model's context; it informs, it never blocks. */
export function contextSignalText(percent: number, threshold: number): string {
  const reached = `Contexte à ${Math.round(percent)} % : chaque tour recharge tout ce contexte.`
  if (threshold >= STRONG_FROM_PERCENT) {
    return `${reached} Écrire maintenant l'état (décisions, reste à faire) dans un fichier ou un ticket, puis reprendre depuis une session neuve avant d'aller plus loin.`
  }
  return `${reached} Si un point d'arrêt approche, écrire l'état (décisions, reste à faire) dans un fichier ou un ticket pour pouvoir continuer depuis une session neuve.`
}

export function isValidThresholds(thresholds: readonly number[]): boolean {
  return thresholds.length > 0 && thresholds.every(t => Number.isFinite(t) && t > 0 && t <= 100)
}

export const sortedThresholds = (config: ContextSignalConfig): number[] => [...config.thresholds].sort((a, b) => a - b)

import type { BandStatus } from '../../types'

const euros = (usd: number): string => `${usd.toFixed(2).replace('.', ',')} $`

/** `granit-golem` becomes `Granit Golem`. */
export function projectTitle(folderName: string): string {
  return folderName
    .split(/[-_]+/)
    .filter(Boolean)
    .map(word => word[0]!.toUpperCase() + word.slice(1))
    .join(' ')
}

/** One line, segments in a fixed order; a segment the band does not know yet is left out. */
export function bandLine(status: BandStatus): string {
  const segments = [
    `🪨 ${status.project}`,
    status.branch,
    status.contextPercent === undefined ? undefined : `ctx ${Math.round(status.contextPercent)} %`,
    status.costUsd === undefined ? undefined : euros(status.costUsd),
    status.worktrees ? `🌳 ${status.worktrees.count}/${status.worktrees.cap} worktrees` : undefined,
    status.mergeRequests ? `📥 ${status.mergeRequests.count}/${status.mergeRequests.cap} MRs` : undefined,
  ]
  return segments.filter((segment): segment is string => segment !== undefined).join(' · ')
}

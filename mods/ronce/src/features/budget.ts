export type OpenMergeRequest = { iid: number; title: string; draft: boolean; labels: string[] }
export type WorktreeState = {
  name: string
  /** False for a folder that matches the naming but holds no repository (an archive of patches). */
  isRepo: boolean
  commitsAhead: number | null
  hasChanges: boolean | null
  ageMinutes: number
}

/** A missing agent type is the general-purpose agent, which writes code: it is never exempt. */
export function isExempt(subagentType: string | undefined, exempt: readonly string[]): boolean {
  if (subagentType === undefined) return false
  // A plugin serves its agents as `<plugin>:<name>`: the policy lists the name alone.
  const unqualified = subagentType.slice(subagentType.lastIndexOf(':') + 1)
  return exempt.includes(subagentType) || exempt.includes(unqualified)
}

/** Open merge requests that count against the cap: neither drafts nor those waiting on a person. */
export function blockingMergeRequests(mrs: readonly OpenMergeRequest[], humanGatedLabels: readonly string[]): OpenMergeRequest[] {
  return mrs.filter(mr => !mr.draft && !mr.labels.some(label => humanGatedLabels.includes(label)))
}

/** Worktrees that count against the cap: repositories that are not empty and settled. */
export function activeWorktrees(states: readonly WorktreeState[], emptyAgeMinutes: number): WorktreeState[] {
  const isEmpty = (w: WorktreeState): boolean => w.commitsAhead === 0 && w.hasChanges === false && w.ageMinutes > emptyAgeMinutes
  return states.filter(w => w.isRepo && !isEmpty(w))
}

export function budgetDenial(args: {
  mergeRequests?: { count: number; cap: number; iids: number[] }
  worktrees?: { count: number; cap: number; names: string[] }
}): string | null {
  const denials: string[] = []
  const mrs = args.mergeRequests
  if (mrs && mrs.count >= mrs.cap) {
    denials.push(`MR budget atteint (${mrs.count}/${mrs.cap} MRs ouvertes : ${mrs.iids.map(iid => `!${iid}`).join(', ')})`)
  }
  const wts = args.worktrees
  if (wts && wts.count >= wts.cap) denials.push(`Worktree budget atteint (${wts.count}/${wts.cap} actifs : ${wts.names.join(', ')})`)
  if (denials.length === 0) return null
  return `${denials.join(' · ')}. Merger ou fermer des MR, finir des worktrees (worktree.ts finish <iid>) avant de dispatcher un nouvel agent de dev.`
}

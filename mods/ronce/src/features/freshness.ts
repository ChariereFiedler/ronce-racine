/** A warning when the local copy of `base` lags behind `remote/base`; null when it does not. */
export function freshnessNote(args: { behind: number; ahead: number; branch: string; remote: string; base: string }): string | null {
  if (!Number.isFinite(args.behind) || args.behind <= 0) return null
  const divergence = args.ahead > 0 ? ` (et ${args.ahead} commit(s) local(aux) non poussés → divergence)` : ''
  return [
    `⚠️  ${args.base} local en retard de ${args.behind} commit(s) sur ${args.remote}/${args.base}${divergence}`,
    `   Branche courante : ${args.branch}.`,
    `   Avant tout chantier : \`git fetch ${args.remote} ${args.base}\` puis brancher ou rebaser depuis ${args.remote}/${args.base}.`,
    '   Un diagnostic sur une base périmée donne des conclusions fausses.',
  ].join('\n')
}

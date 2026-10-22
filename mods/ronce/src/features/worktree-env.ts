/** The links a linked worktree is missing: a file the main checkout has and the worktree has not. */
export function linksToCreate(args: {
  worktreeRoot: string
  mainRoot: string
  names: readonly string[]
  exists: (path: string) => boolean
}): { link: string; target: string }[] {
  if (args.worktreeRoot === args.mainRoot) return []
  return args.names
    .map(name => ({ link: `${args.worktreeRoot}/${name}`, target: `${args.mainRoot}/${name}` }))
    .filter(({ link, target }) => !args.exists(link) && args.exists(target))
}

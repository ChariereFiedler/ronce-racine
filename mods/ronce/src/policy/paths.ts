const withoutTrailingSlash = (path: string): string => path.replace(/\/+$/, '')

/** The directory a path stands in; the module has no `node:path`. */
export function parentDir(path: string): string {
  const trimmed = withoutTrailingSlash(path)
  return trimmed.slice(0, trimmed.lastIndexOf('/')) || '/'
}

export function baseName(path: string): string {
  const trimmed = withoutTrailingSlash(path)
  return trimmed.slice(trimmed.lastIndexOf('/') + 1)
}

/** `~/x` becomes `<home>/x`; any other path, or an unknown home, is left as given. */
export function expandHome(path: string, home: string | undefined): string {
  return path.startsWith('~/') && home ? `${home}${path.slice(1)}` : path
}

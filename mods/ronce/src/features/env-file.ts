/** The value of `name` in a `.env` file, quotes removed; null when it is missing or empty. */
export function envValue(text: string, name: string): string | null {
  const line = text.split('\n').find(entry => entry.startsWith(`${name}=`))
  const value = line?.slice(name.length + 1).trim().replace(/^["']|["']$/g, '')
  return value ? value : null
}

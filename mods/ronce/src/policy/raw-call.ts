import type { RawCall } from '../../types'

const text = (input: Readonly<Record<string, unknown>>, key: string): string | undefined =>
  typeof input[key] === 'string' ? (input[key] as string) : undefined

/** Reduces a tool call's input to the fields the rules read. */
export function toRawCall(input: Readonly<Record<string, unknown>>): RawCall {
  return {
    tool: String(input.tool),
    command: text(input, 'command'),
    file_path: text(input, 'file_path'),
    content: text(input, 'content') ?? text(input, 'new_string'),
    limit: typeof input.limit === 'number' ? input.limit : undefined,
    prompt: text(input, 'prompt'),
    subagent_type: text(input, 'subagent_type'),
    model: text(input, 'model'),
  }
}

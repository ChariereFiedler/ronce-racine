#!/usr/bin/env tsx
/**
 * Offline report over the ronce mod's telemetry (one JSONL file per turn).
 *   npx tsx tools/ronce-report.ts --since 2026-10-09 [--until 2026-10-15] [--repo <dir>] [--dir <events dir>]
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { formatSummary, summarize } from '../mods/ronce/src/report/summarize.ts'
import type { TelemetryEvent } from '../mods/ronce/types'

const DAY = /^\d{4}-\d{2}-\d{2}$/
const LAST_DAY = '9999-12-31'

function parseFile(path: string): TelemetryEvent[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(line => line.trim() !== '')
    .map((line, index) => {
      try {
        return JSON.parse(line) as TelemetryEvent
      } catch (error) {
        throw new Error(`${path}:${index + 1} : ligne JSON invalide (${error instanceof Error ? error.message : String(error)})`)
      }
    })
}

function readEvents(dir: string, since: string, until: string): TelemetryEvent[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(day => DAY.test(day) && day >= since && day <= until)
    .flatMap(day =>
      readdirSync(join(dir, day))
        .filter(file => file.endsWith('.jsonl'))
        .flatMap(file => parseFile(join(dir, day, file))),
    )
}

function main(): void {
  const { values } = parseArgs({
    options: { since: { type: 'string' }, until: { type: 'string' }, repo: { type: 'string' }, dir: { type: 'string' } },
  })
  if (!values.since || !DAY.test(values.since)) throw new Error('--since AAAA-MM-JJ est requis')
  const dir = values.dir ?? join(homedir(), '.claude', 'ronce', 'events')
  const events = readEvents(dir, values.since, values.until ?? LAST_DAY)
  const scoped = values.repo ? events.filter(event => event.projectDir.startsWith(values.repo!)) : events
  process.stdout.write(`${formatSummary(summarize(scoped))}\n`)
}

main()

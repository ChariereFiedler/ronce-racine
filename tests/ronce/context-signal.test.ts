import { describe, expect, it } from 'vitest'
import { contextSignalText, crossedThreshold, rearmed } from '../../mods/ronce/src/features/context-signal.ts'

const THRESHOLDS = [40, 60, 75]

describe('crossedThreshold', () => {
  it('returns null when the percent is unknown', () => {
    expect(crossedThreshold(undefined, [], THRESHOLDS)).toBeNull()
  })

  it('returns null below the first threshold', () => {
    expect(crossedThreshold(39, [], THRESHOLDS)).toBeNull()
  })

  it('returns the first threshold once crossed', () => {
    expect(crossedThreshold(41, [], THRESHOLDS)).toBe(40)
  })

  it('returns the highest threshold not yet fired when several are crossed at once', () => {
    expect(crossedThreshold(65, [], THRESHOLDS)).toBe(60)
  })

  it('returns null when the crossed threshold already fired', () => {
    expect(crossedThreshold(65, [40, 60], THRESHOLDS)).toBeNull()
  })

  it('fires the next threshold after an earlier one fired', () => {
    expect(crossedThreshold(80, [40], THRESHOLDS)).toBe(75)
  })
})

describe('rearmed', () => {
  it('keeps thresholds at or below the percent and drops the others', () => {
    expect(rearmed(30, [40, 60, 75])).toEqual([])
    expect(rearmed(65, [40, 60, 75])).toEqual([40, 60])
  })

  it('changes nothing when the percent is unknown', () => {
    expect(rearmed(undefined, [40, 60])).toEqual([40, 60])
  })
})

describe('contextSignalText', () => {
  it('names the percent reached', () => {
    expect(contextSignalText(63.4, 60)).toContain('63')
  })

  it('advises writing the state down and starting fresh', () => {
    const text = contextSignalText(45, 40)
    expect(text).toMatch(/session/)
    expect(text).toMatch(/fichier|ticket/)
  })

  it('words the last threshold more strongly than the first', () => {
    expect(contextSignalText(80, 75)).not.toEqual(contextSignalText(45, 40))
    expect(contextSignalText(80, 75)).toMatch(/maintenant|avant d.aller plus loin/i)
  })
})

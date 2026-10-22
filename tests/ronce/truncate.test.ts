import { describe, expect, it } from 'vitest'
import { fullOutputPath, planShaping } from '../../mods/ronce/src/shaping/truncate.ts'

const CFG = { mode: 'shadow' as const, maxChars: 4000, headLines: 20, tailLines: 20, dir: '/tmp/ronce/outputs' }

describe('planShaping', () => {
  it('keeps a short output', () => {
    expect(planShaping('ok', CFG, '/p')).toBeNull()
  })

  it('keeps head and tail and says where the whole output is', () => {
    const output = Array.from({ length: 500 }, (_, i) => `line ${i} ${'x'.repeat(20)}`).join('\n')
    const plan = planShaping(output, CFG, '/tmp/ronce/outputs/s/t.log')!
    expect(plan.text).toContain('line 0 ')
    expect(plan.text).toContain('line 499 ')
    expect(plan.text).not.toContain('line 250 ')
    expect(plan.text).toContain('460 lignes retirées sur 500 · sortie complète : /tmp/ronce/outputs/s/t.log')
    expect(plan.keptChars).toBeLessThan(plan.originalChars)
  })

  it('leaves a single huge line alone rather than cutting it blindly', () => {
    expect(planShaping('x'.repeat(50_000), CFG, '/p')).toBeNull()
  })
})

describe('fullOutputPath', () => {
  it('files the output by session and call', () => {
    expect(fullOutputPath('/tmp/ronce/outputs', 's1', 'toolu_1')).toBe('/tmp/ronce/outputs/s1/toolu_1.log')
  })
})

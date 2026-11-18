import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { planRuleMerges, stripSizeSuffix  } from './partner-rule-merge'
import type {MergeRule} from './partner-rule-merge';

const rule = (over: Partial<MergeRule> & { id: string }): MergeRule => ({
  partnerId: 'pt',
  name: over.id,
  minQty: 2,
  bundlePrice: '100000.00',
  isActive: true,
  position: 0,
  createdAt: '2026-01-01T00:00:00Z',
  ...over,
})

describe('stripSizeSuffix', () => {
  it('membuang keterangan ukuran di belakang nama', () => {
    assert.equal(stripSizeSuffix('100K / 2pcs (S, M, L)'), '100K / 2pcs')
    assert.equal(stripSizeSuffix('100K / 2pcs (semua ukuran)'), '100K / 2pcs')
    assert.equal(stripSizeSuffix('Paket Spesial'), 'Paket Spesial')
    assert.equal(stripSizeSuffix('(S, M)'), '(S, M)')
  })
})

describe('planRuleMerges', () => {
  const rules = [
    rule({ id: 'a', name: '100K / 2pcs (S, M, L)' }),
    rule({ id: 'b', name: '100K / 2pcs (semua ukuran)', createdAt: '2026-02-01T00:00:00Z' }),
    rule({ id: 'c', name: '110K / 2pcs (XL, XXL, XXXL)', bundlePrice: '110000.00' }),
  ]
  const links = [
    { ruleId: 'a', partnerProductId: 'p1' },
    { ruleId: 'a', partnerProductId: 'p2' },
    { ruleId: 'b', partnerProductId: 'p3' },
    { ruleId: 'c', partnerProductId: 'p1' },
  ]
  const sizes = [
    { ruleId: 'a', partnerProductId: 'p1', sizeName: 'S' },
    { ruleId: 'a', partnerProductId: 'p1', sizeName: 'M' },
    { ruleId: 'a', partnerProductId: 'p2', sizeName: 'S' },
    { ruleId: 'b', partnerProductId: 'p3', sizeName: '40' },
    { ruleId: 'c', partnerProductId: 'p1', sizeName: 'XL' },
  ]

  it('menggabung aturan dengan pcs dan harga sama, bukan yang harganya beda', () => {
    const plans = planRuleMerges(rules, links, sizes)
    assert.equal(plans.length, 1)
    assert.equal(plans[0].keeperId, 'a')
    assert.deepEqual(plans[0].mergedIds, ['b'])
    assert.equal(plans[0].newName, '100K / 2pcs')
    assert.deepEqual(plans[0].productIds.sort(), ['p1', 'p2', 'p3'])
    assert.deepEqual(plans[0].productSizes, { p1: ['S', 'M'], p2: ['S'], p3: ['40'] })
  })

  it('aturan yang pcs-nya beda tidak digabung', () => {
    const plans = planRuleMerges(
      [rule({ id: 'a' }), rule({ id: 'b', minQty: 3 })],
      [],
      [],
    )
    assert.equal(plans.length, 0)
  })

  it('aturan nonaktif tidak digabung dengan yang aktif', () => {
    const plans = planRuleMerges([rule({ id: 'a' }), rule({ id: 'b', isActive: false })], [], [])
    assert.equal(plans.length, 0)
  })

  it('partner berbeda tidak digabung', () => {
    const plans = planRuleMerges([rule({ id: 'a' }), rule({ id: 'b', partnerId: 'lain' })], [], [])
    assert.equal(plans.length, 0)
  })

  it('keeper adalah aturan dengan posisi terkecil, lalu yang tertua', () => {
    const plans = planRuleMerges(
      [
        rule({ id: 'x', position: 2 }),
        rule({ id: 'y', position: 1, createdAt: '2026-03-01T00:00:00Z' }),
        rule({ id: 'z', position: 1, createdAt: '2026-01-01T00:00:00Z' }),
      ],
      [],
      [],
    )
    assert.equal(plans[0].keeperId, 'z')
    assert.deepEqual(plans[0].mergedIds, ['y', 'x'])
  })
})

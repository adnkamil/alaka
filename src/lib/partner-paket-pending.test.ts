import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { computePendingRules, type PendingSingle } from './partner-paket-pending'

const t = (n: number) => new Date(2026, 10, 2, 10, n)
const base = { ruleId: 'r1', ruleName: 'Paket 100/3pcs', minQty: 3 }

describe('computePendingRules', () => {
  it('4 pcs untuk aturan 3 pcs menyisakan 1 pcs dan kurang 2', () => {
    const rows: Array<PendingSingle> = [
      { ...base, itemId: 'a', qty: 2, addedAt: t(1) },
      { ...base, itemId: 'b', qty: 2, addedAt: t(2) },
    ]
    assert.deepEqual(computePendingRules(rows), [
      { ruleId: 'r1', ruleName: 'Paket 100/3pcs', minQty: 3, pendingPcs: 1, pcsShort: 2 },
    ])
  })

  it('pcs yang pas membentuk paket dan tidak menyisakan catatan', () => {
    const rows: Array<PendingSingle> = [
      { ...base, itemId: 'a', qty: 3, addedAt: t(1) },
    ]
    assert.deepEqual(computePendingRules(rows), [])
  })

  it('aturan berbeda dihitung terpisah', () => {
    const rows: Array<PendingSingle> = [
      { ...base, itemId: 'a', qty: 1, addedAt: t(1) },
      { ruleId: 'r2', ruleName: 'Paket 80/2pcs', minQty: 2, itemId: 'b', qty: 1, addedAt: t(2) },
    ]
    const result = computePendingRules(rows)
    assert.equal(result.length, 2)
    assert.equal(result.find((r) => r.ruleId === 'r2')?.pcsShort, 1)
    assert.equal(result.find((r) => r.ruleId === 'r1')?.pcsShort, 2)
  })
})

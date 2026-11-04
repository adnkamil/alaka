import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { carryCreatedAt } from './item-created-at'

const t = (n: number) => new Date(2026, 10, 2, 10, n)

describe('carryCreatedAt', () => {
  it('mempertahankan waktu masuk untuk barang yang sama', () => {
    const prev = [{ name: 'A (S)', partnerVariantId: 'v1', createdAt: t(1) }]
    const out = carryCreatedAt(prev, [{ name: 'A (S)', partnerVariantId: 'v1', qty: 2 }])
    assert.equal(out[0].createdAt?.getTime(), t(1).getTime())
  })

  it('barang baru tidak mendapat waktu lama', () => {
    const prev = [{ name: 'A (S)', partnerVariantId: 'v1', createdAt: t(1) }]
    const out = carryCreatedAt(prev, [{ name: 'B (M)', partnerVariantId: 'v2' }])
    assert.equal(out[0].createdAt, undefined)
  })

  it('satu baris lama hanya dipakai sekali', () => {
    const prev = [{ name: 'A', partnerVariantId: 'v1', createdAt: t(1) }]
    const out = carryCreatedAt(prev, [
      { name: 'A', partnerVariantId: 'v1' },
      { name: 'A', partnerVariantId: 'v1' },
    ])
    assert.ok(out[0].createdAt)
    assert.equal(out[1].createdAt, undefined)
  })
})

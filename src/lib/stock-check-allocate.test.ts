import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { allocateAutoApprovals } from './stock-check-allocate'

describe('allocateAutoApprovals', () => {
  it('menyetujui penuh kalau stok cukup', () => {
    const result = allocateAutoApprovals(
      [{ key: 'a', variantId: 'v1', qty: 3 }],
      new Map([['v1', 10]]),
    )
    assert.equal(result.get('a'), 3)
  })

  it('mengambil sebagian kalau stok kurang, sisanya tidak disetujui', () => {
    const result = allocateAutoApprovals(
      [{ key: 'a', variantId: 'v1', qty: 10 }],
      new Map([['v1', 4]]),
    )
    assert.equal(result.get('a'), 4)
  })

  it('baris sebelumnya dalam urutan mendapat stok lebih dulu', () => {
    const result = allocateAutoApprovals(
      [
        { key: 'a', variantId: 'v1', qty: 3 },
        { key: 'b', variantId: 'v1', qty: 3 },
      ],
      new Map([['v1', 4]]),
    )
    assert.equal(result.get('a'), 3)
    assert.equal(result.get('b'), 1)
  })

  it('varian habis atau tidak dikenal disetujui 0', () => {
    const result = allocateAutoApprovals(
      [
        { key: 'a', variantId: 'v1', qty: 2 },
        { key: 'b', variantId: 'v9', qty: 2 },
      ],
      new Map([['v1', 0]]),
    )
    assert.equal(result.get('a'), 0)
    assert.equal(result.get('b'), 0)
  })

  it('baris tanpa varian katalog selalu disetujui penuh', () => {
    const result = allocateAutoApprovals(
      [{ key: 'a', variantId: null, qty: 5 }],
      new Map(),
    )
    assert.equal(result.get('a'), 5)
  })
})

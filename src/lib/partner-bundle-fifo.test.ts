import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formBundles, type FifoRow } from './partner-bundle-fifo'

const t = (n: number) => new Date(2026, 10, 2, 10, n)

describe('formBundles', () => {
  it('membentuk satu paket dari pcs yang tepat', () => {
    const rows: Array<FifoRow> = [
      { itemId: 'a', qty: 1, addedAt: t(1) },
      { itemId: 'b', qty: 1, addedAt: t(2) },
      { itemId: 'c', qty: 1, addedAt: t(3) },
    ]
    const r = formBundles(rows, 3)
    assert.equal(r.bundles.length, 1)
    assert.deepEqual(r.bundles[0].parts, [
      { itemId: 'a', qty: 1 },
      { itemId: 'b', qty: 1 },
      { itemId: 'c', qty: 1 },
    ])
    assert.deepEqual(r.leftover, [])
    assert.equal(r.pcsShort, 0)
  })

  it('4 pcs untuk aturan 3 pcs: satu paket dan satu sisa satuan', () => {
    const rows: Array<FifoRow> = [
      { itemId: 'a', qty: 2, addedAt: t(1) },
      { itemId: 'b', qty: 2, addedAt: t(2) },
    ]
    const r = formBundles(rows, 3)
    assert.equal(r.bundles.length, 1)
    assert.deepEqual(r.bundles[0].parts, [
      { itemId: 'a', qty: 2 },
      { itemId: 'b', qty: 1 },
    ])
    assert.deepEqual(r.leftover, [{ itemId: 'b', qty: 1 }])
    assert.equal(r.pendingPcs, 1)
    assert.equal(r.pcsShort, 2)
  })

  it('urutan mengikuti waktu masuk (FIFO), bukan urutan array', () => {
    const rows: Array<FifoRow> = [
      { itemId: 'baru', qty: 1, addedAt: t(9) },
      { itemId: 'lama', qty: 1, addedAt: t(1) },
      { itemId: 'tengah', qty: 1, addedAt: t(5) },
    ]
    const r = formBundles(rows, 2)
    assert.deepEqual(r.bundles[0].parts.map((p) => p.itemId), ['lama', 'tengah'])
    assert.deepEqual(r.leftover, [{ itemId: 'baru', qty: 1 }])
  })

  it('6 pcs untuk aturan 3 pcs: dua paket, tanpa sisa', () => {
    const rows: Array<FifoRow> = [
      { itemId: 'a', qty: 4, addedAt: t(1) },
      { itemId: 'b', qty: 2, addedAt: t(2) },
    ]
    const r = formBundles(rows, 3)
    assert.equal(r.bundles.length, 2)
    assert.deepEqual(r.bundles[0].parts, [{ itemId: 'a', qty: 3 }])
    assert.deepEqual(r.bundles[1].parts, [
      { itemId: 'a', qty: 1 },
      { itemId: 'b', qty: 2 },
    ])
    assert.deepEqual(r.leftover, [])
  })

  it('aturan 2 pcs (80/2pcs) dengan produk yang berbeda motif dan ukuran', () => {
    const rows: Array<FifoRow> = [
      { itemId: 'pink-s', qty: 1, addedAt: t(1) },
      { itemId: 'biru-m', qty: 1, addedAt: t(2) },
    ]
    const r = formBundles(rows, 2)
    assert.equal(r.bundles.length, 1)
    assert.deepEqual(r.bundles[0].parts.map((p) => p.itemId), ['pink-s', 'biru-m'])
  })

  it('tanpa barang tidak membentuk paket', () => {
    const r = formBundles([], 3)
    assert.deepEqual(r.bundles, [])
    assert.equal(r.pendingPcs, 0)
    assert.equal(r.pcsShort, 0)
  })

  it('tidak mengubah input', () => {
    const rows: Array<FifoRow> = [{ itemId: 'a', qty: 4, addedAt: t(1) }]
    formBundles(rows, 3)
    assert.equal(rows[0].qty, 4)
  })

  it('menolak minQty tidak valid', () => {
    assert.throws(() => formBundles([], 0))
    assert.throws(() => formBundles([], 1.5))
  })
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { lineTotal, partitionLockedItems } from './partner-bundle-lock'

describe('partitionLockedItems', () => {
  it('memisahkan baris paket (terkunci) dari barang satuan', () => {
    const rows = [
      { id: 'a', isBundle: true },
      { id: 'b', isBundle: false },
      { id: 'c', isBundle: false },
    ]
    const { locked, editable } = partitionLockedItems(rows)
    assert.deepEqual(locked.map((r) => r.id), ['a'])
    assert.deepEqual(editable.map((r) => r.id), ['b', 'c'])
  })

  it('barang satuan dengan aturan tidak ikut terkunci', () => {
    // Satuan tidak lagi menyimpan partnerRuleId, jadi hanya isBundle yang menentukan.
    const rows = [{ id: 'satuan-beraturan', isBundle: false }]
    assert.deepEqual(partitionLockedItems(rows).editable.map((r) => r.id), ['satuan-beraturan'])
  })
})

describe('lineTotal', () => {
  it('menerima angka dan string dari kolom decimal', () => {
    assert.equal(lineTotal({ originalPrice: '100000.00', fee: '10000.00', qty: 2 }), 220000)
    assert.equal(lineTotal({ originalPrice: 50000, fee: 5000, qty: 1 }), 55000)
  })
})

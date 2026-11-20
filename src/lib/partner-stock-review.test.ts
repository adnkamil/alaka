import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  allocateApproved,
  buildDisplayEntries,
  overStockRowIds,
  splitApproved,
} from './partner-stock-review'

const row = (id: string, qty: number, variant: string | null, stock: number | null) => ({
  id,
  qty,
  partnerVariantId: variant,
  stock,
})

describe('allocateApproved', () => {
  it('membatasi ke stok dan membagi stok antar baris varian yang sama', () => {
    const result = allocateApproved([
      row('1', 3, 'a', 4),
      row('2', 3, 'a', 4),
      row('3', 2, 'b', 0),
    ])
    assert.deepEqual(result, { '1': 3, '2': 1, '3': 0 })
  })

  it('barang tanpa varian katalog tidak dibatasi', () => {
    assert.deepEqual(allocateApproved([row('1', 5, null, null)]), { '1': 5 })
  })
})

describe('overStockRowIds', () => {
  it('menandai baris varian yang totalnya melebihi stok', () => {
    const rows = [row('1', 3, 'a', 4), row('2', 3, 'a', 4), row('3', 1, 'b', 1)]
    const over = overStockRowIds(rows, { '1': 3, '2': 3, '3': 1 })
    assert.deepEqual([...over].sort(), ['1', '2'])
  })

  it('kosong kalau total pas stok', () => {
    const rows = [row('1', 3, 'a', 4), row('2', 1, 'a', 4)]
    assert.equal(overStockRowIds(rows, { '1': 3, '2': 1 }).size, 0)
  })
})

describe('splitApproved', () => {
  it('mengisi baris pertama penuh dulu, sisanya ke baris berikutnya', () => {
    const rows = [
      { id: '1', qty: 2 },
      { id: '2', qty: 2 },
      { id: '3', qty: 1 },
    ]
    assert.deepEqual(splitApproved(rows, 3), { '1': 2, '2': 1, '3': 0 })
    assert.deepEqual(splitApproved(rows, 5), { '1': 2, '2': 2, '3': 1 })
    assert.deepEqual(splitApproved(rows, 0), { '1': 0, '2': 0, '3': 0 })
  })

  it('jumlah berlebih tidak melebihi qty tiap baris', () => {
    assert.deepEqual(splitApproved([{ id: '1', qty: 2 }], 9), { '1': 2 })
  })

  it('jumlah negatif atau bukan angka dianggap nol', () => {
    assert.deepEqual(splitApproved([{ id: '1', qty: 2 }], -3), { '1': 0 })
    assert.deepEqual(splitApproved([{ id: '1', qty: 2 }], Number.NaN), { '1': 0 })
  })
})

describe('buildDisplayEntries', () => {
  const rows = [
    { id: 'a', v: 'x' },
    { id: 'b', v: 'y' },
    { id: 'c', v: 'x' },
    { id: 'd', v: null },
    { id: 'e', v: 'x' },
  ]
  const keyOf = (r: { v: string | null }) => r.v

  it('menggabungkan baris sekunci di posisi kemunculan pertama', () => {
    const entries = buildDisplayEntries(rows, keyOf)
    assert.deepEqual(
      entries.map((e) => (e.kind === 'group' ? `G:${e.rows.map((r) => r.id).join('')}` : e.row.id)),
      ['G:ace', 'b', 'd'],
    )
  })

  it('kunci yang hanya punya satu baris tetap baris biasa', () => {
    const entries = buildDisplayEntries([{ id: 'a', v: 'x' }], keyOf)
    assert.equal(entries[0].kind, 'row')
  })

  it('baris tanpa kunci tidak pernah digabung', () => {
    const entries = buildDisplayEntries(
      [
        { id: 'a', v: null },
        { id: 'b', v: null },
      ],
      keyOf,
    )
    assert.equal(entries.length, 2)
    assert.ok(entries.every((e) => e.kind === 'row'))
  })
})

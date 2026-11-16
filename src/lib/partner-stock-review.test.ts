import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { allocateApproved, overStockRowIds } from './partner-stock-review'

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

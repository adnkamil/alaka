import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildPicklist, type PicklistSourceRow } from './partner-picklist-rules'

const base = (over: Partial<PicklistSourceRow>): PicklistSourceRow => ({
  productName: 'Kana Pants',
  size: 'M',
  variation: 'Marine Cove',
  ruleId: null,
  ruleName: null,
  brandName: 'Toko A',
  qty: 1,
  ...over,
})

describe('buildPicklist', () => {
  it('menjumlahkan qty per produk, ukuran, variasi, dan jastiper', () => {
    const out = buildPicklist([
      base({ qty: 2 }),
      base({ qty: 1, brandName: 'Toko B' }),
      base({ qty: 3 }),
    ])
    assert.equal(out.length, 1)
    assert.equal(out[0].total, 6)
    assert.deepEqual(out[0].byJastiper, [
      { brandName: 'Toko A', qty: 5 },
      { brandName: 'Toko B', qty: 1 },
    ])
  })

  it('memisahkan barang satuan dan barang dari paket', () => {
    const out = buildPicklist([
      base({ qty: 1 }),
      base({ qty: 2, ruleId: 'r1', ruleName: '3 pcs' }),
    ])
    assert.equal(out.length, 2)
  })

  it('filter satuan hanya menampilkan barang satuan', () => {
    const out = buildPicklist(
      [base({ qty: 1 }), base({ qty: 2, ruleId: 'r1', ruleName: '3 pcs' })],
      'satuan',
    )
    assert.deepEqual(out.map((r) => r.total), [1])
  })

  it('filter aturan hanya menampilkan barang dari aturan itu', () => {
    const out = buildPicklist(
      [
        base({ qty: 1 }),
        base({ qty: 2, ruleId: 'r1', ruleName: '3 pcs' }),
        base({ qty: 4, ruleId: 'r2', ruleName: '2 pcs' }),
      ],
      'r2',
    )
    assert.deepEqual(out.map((r) => [r.ruleId, r.total]), [['r2', 4]])
  })

  it('mengabaikan qty nol atau negatif', () => {
    assert.equal(buildPicklist([base({ qty: 0 })]).length, 0)
  })
})

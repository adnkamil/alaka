import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { lineTotal, partitionLockedItems } from './partner-bundle-lock'

describe('partitionLockedItems', () => {
  it('memisahkan baris bundle partner (terkunci) dari barang satuan dan bundle manual', () => {
    const rows = [
      { id: 'a', partnerRuleId: 'rule-1' },
      { id: 'b', partnerRuleId: null },
      { id: 'c', partnerRuleId: null },
    ]
    const { locked, editable } = partitionLockedItems(rows)
    assert.deepEqual(locked.map((r) => r.id), ['a'])
    assert.deepEqual(editable.map((r) => r.id), ['b', 'c'])
  })
})

describe('lineTotal', () => {
  it('menerima angka dan string dari kolom decimal', () => {
    assert.equal(lineTotal({ originalPrice: '100000.00', fee: '10000.00', qty: 2 }), 220000)
    assert.equal(lineTotal({ originalPrice: 50000, fee: 5000, qty: 1 }), 55000)
  })
})

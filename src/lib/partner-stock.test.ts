import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  aggregateStockDemand,
  findStockShortages,
  formatStockShortages,
} from './partner-stock'

describe('aggregateStockDemand', () => {
  it('menjumlahkan qty per varian dan mengabaikan baris tanpa varian', () => {
    const demand = aggregateStockDemand([
      { variantId: 'a', qty: 2 },
      { variantId: 'a', qty: 3 },
      { variantId: 'b', qty: 1 },
      { variantId: null, qty: 9 },
      { variantId: 'c', qty: 0 },
    ])
    assert.deepEqual([...demand], [['a', 5], ['b', 1]])
  })
})

describe('findStockShortages', () => {
  const available = new Map([
    ['a', { name: 'Kana (S)', stock: 4 }],
    ['b', { name: 'Kana (M)', stock: 0 }],
  ])

  it('lolos kalau stok cukup, termasuk pas habis', () => {
    assert.deepEqual(findStockShortages(new Map([['a', 4]]), available), [])
  })

  it('melaporkan varian yang kurang dan yang habis', () => {
    const shortages = findStockShortages(
      new Map([['a', 5], ['b', 1]]),
      available,
    )
    assert.equal(shortages.length, 2)
    assert.equal(
      formatStockShortages(shortages),
      'Kana (S): stok tinggal 4, diminta 5; Kana (M) habis',
    )
  })

  it('menganggap varian tak dikenal sebagai habis', () => {
    const shortages = findStockShortages(new Map([['x', 1]]), available)
    assert.equal(shortages[0].stock, 0)
  })
})

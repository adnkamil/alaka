import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ruleIdByProduct, selectableProducts } from './partner-rule-availability'

const products = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
const rules = [
  { id: 'r1', productIds: ['a', 'b'] },
  { id: 'r2', productIds: ['c'] },
]

describe('selectableProducts', () => {
  it('aturan baru hanya menampilkan produk yang belum punya aturan', () => {
    assert.deepEqual(selectableProducts(products, rules, null).map((p) => p.id), ['d'])
  })

  it('aturan yang sedang diubah tetap menampilkan produk miliknya sendiri', () => {
    assert.deepEqual(selectableProducts(products, rules, 'r1').map((p) => p.id), ['a', 'b', 'd'])
  })

  it('tanpa aturan sama sekali, semua produk tersedia', () => {
    assert.deepEqual(selectableProducts(products, [], null).length, 4)
  })
})

describe('ruleIdByProduct', () => {
  it('memetakan setiap produk ke aturannya', () => {
    const map = ruleIdByProduct(rules)
    assert.equal(map.get('a'), 'r1')
    assert.equal(map.get('c'), 'r2')
    assert.equal(map.get('d'), undefined)
  })
})

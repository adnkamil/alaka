import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { selectableProducts } from './partner-rule-availability'

describe('selectableProducts', () => {
  it('semua produk tetap bisa dipilih, termasuk yang sudah ada di aturan lain', () => {
    const products = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    assert.deepEqual(selectableProducts(products).map((p) => p.id), ['a', 'b', 'c'])
  })
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { discountPercent } from './price-discount'

describe('discountPercent', () => {
  it('menghitung persen dari harga awal ke harga promo', () => {
    assert.equal(discountPercent(50000, 15000), 70)
    assert.equal(discountPercent('50000.00', '15000.00'), 70)
  })

  it('membulatkan ke bilangan bulat terdekat', () => {
    // (30000 - 20000) / 30000 = 33.33...%
    assert.equal(discountPercent(30000, 20000), 33)
  })

  it('null kalau harga awal kosong', () => {
    assert.equal(discountPercent(null, 15000), null)
    assert.equal(discountPercent(undefined, 15000), null)
  })

  it('null kalau harga awal tidak lebih besar dari promo', () => {
    assert.equal(discountPercent(15000, 15000), null)
    assert.equal(discountPercent(10000, 15000), null)
  })

  it('null kalau harga awal nol atau input tidak valid', () => {
    assert.equal(discountPercent(0, 0), null)
    assert.equal(discountPercent('abc', 15000), null)
  })

  it('promo gratis (0) = diskon 100%', () => {
    assert.equal(discountPercent(50000, 0), 100)
  })
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { partnerItemName, variantLabel } from './partner-item-label'

describe('variantLabel', () => {
  it('gabungkan ukuran dan variasi', () => {
    assert.equal(variantLabel({ size: 'S', variation: 'Marine Cove' }), 'S / Marine Cove')
  })

  it('pakai salah satu kalau hanya ada satu opsi', () => {
    assert.equal(variantLabel({ size: 'L', variation: null }), 'L')
    assert.equal(variantLabel({ size: null, variation: 'Cream' }), 'Cream')
  })

  it('kosong untuk produk tanpa opsi', () => {
    assert.equal(variantLabel({ size: null, variation: null }), '')
  })
})

describe('partnerItemName', () => {
  it('tambahkan label varian dalam kurung', () => {
    assert.equal(
      partnerItemName('Kana Longsleeve Set', 'XL / Ocean Whale'),
      'Kana Longsleeve Set (XL / Ocean Whale)',
    )
  })

  it('pakai nama produk saja kalau tanpa varian', () => {
    assert.equal(partnerItemName('Kana Longsleeve Set', ''), 'Kana Longsleeve Set')
  })
})

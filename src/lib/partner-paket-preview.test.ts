import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { previewPartnerBundles } from './partner-paket-preview'

const catalog = {
  rules: [
    { id: 'r3', name: 'Paket Hemat 3 pcs', minQty: 3, bundlePrice: 110000, productIds: ['pX'] },
    { id: 'r2', name: 'Paket 80/2pcs', minQty: 2, bundlePrice: 80000, productIds: ['pY'] },
  ],
  variants: [
    { id: 'vL', productId: 'pX' },
    { id: 'vM', productId: 'pX' },
    { id: 'vY', productId: 'pY' },
  ],
}

describe('previewPartnerBundles', () => {
  it('3 pcs dari satu aturan membentuk satu paket tanpa sisa', () => {
    const r = previewPartnerBundles(
      [{ key: 'a', name: 'X (L)', partnerVariantId: 'vL', qty: 3 }],
      catalog,
    )
    assert.equal(r.bundles.length, 1)
    assert.equal(r.bundles[0].ruleName, 'Paket Hemat 3 pcs')
    assert.deepEqual(r.bundles[0].parts, [{ key: 'a', label: 'X (L)', qty: 3 }])
    assert.deepEqual(r.pending, [])
  })

  it('4 pcs menyisakan catatan kekurangan 2 pcs', () => {
    const r = previewPartnerBundles(
      [
        { key: 'a', name: 'X (L)', partnerVariantId: 'vL', qty: 2 },
        { key: 'b', name: 'X (M)', partnerVariantId: 'vM', qty: 2 },
      ],
      catalog,
    )
    assert.equal(r.bundles.length, 1)
    assert.deepEqual(r.pending, [{ ruleId: 'r3', ruleName: 'Paket Hemat 3 pcs', pcsShort: 2 }])
  })

  it('barang tanpa varian partner atau tanpa aturan tidak ikut', () => {
    const r = previewPartnerBundles(
      [
        { key: 'a', name: 'Manual', partnerVariantId: null, qty: 5 },
        { key: 'b', name: 'Tanpa aturan', partnerVariantId: 'unknown', qty: 5 },
      ],
      catalog,
    )
    assert.deepEqual(r.bundles, [])
    assert.deepEqual(r.pending, [])
  })

  it('aturan berbeda dihitung terpisah', () => {
    const r = previewPartnerBundles(
      [
        { key: 'a', name: 'X', partnerVariantId: 'vL', qty: 1 },
        { key: 'b', name: 'Y', partnerVariantId: 'vY', qty: 2 },
      ],
      catalog,
    )
    assert.equal(r.bundles.length, 1)
    assert.equal(r.bundles[0].ruleId, 'r2')
    assert.deepEqual(r.pending, [{ ruleId: 'r3', ruleName: 'Paket Hemat 3 pcs', pcsShort: 2 }])
  })
})

describe('previewPartnerBundles dengan rentang ukuran', () => {
  const catalog = {
    rules: [
      { id: 'sl', name: 'Get 2 S–L', minQty: 2, bundlePrice: 100000, productIds: ['p1'], sizes: ['S', 'M', 'L'] },
      { id: 'xl', name: 'Get 2 XL–XXXL', minQty: 2, bundlePrice: 110000, productIds: ['p1'], sizes: ['XL', 'XXL', 'XXXL'] },
    ],
    variants: [
      { id: 'v-l', productId: 'p1', size: 'L' },
      { id: 'v-xl', productId: 'p1', size: 'XL' },
      { id: 'v-m', productId: 'p1', size: 'M' },
    ],
  }

  it('L dan XL tidak dipaketkan bersama karena beda rentang', () => {
    const { bundles } = previewPartnerBundles(
      [
        { key: 'a', name: 'L', partnerVariantId: 'v-l', qty: 1 },
        { key: 'b', name: 'XL', partnerVariantId: 'v-xl', qty: 1 },
      ],
      catalog,
    )
    assert.equal(bundles.length, 0)
  })

  it('L + M dipaketkan karena masih satu rentang', () => {
    const { bundles } = previewPartnerBundles(
      [
        { key: 'a', name: 'L', partnerVariantId: 'v-l', qty: 1 },
        { key: 'b', name: 'M', partnerVariantId: 'v-m', qty: 1 },
      ],
      catalog,
    )
    assert.equal(bundles.length, 1)
    assert.equal(bundles[0].ruleId, 'sl')
  })
})

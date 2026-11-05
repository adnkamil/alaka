import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { formatBundlePriceShort, formatRuleLabel } from './partner-rule-label'

describe('formatRuleLabel', () => {
  it('format 100K / 2pcs (S, M, L)', () => {
    assert.equal(
      formatRuleLabel({ minQty: 2, bundlePrice: 100000, sizes: ['S', 'M', 'L'] }),
      '100K / 2pcs (S, M, L)',
    )
  })

  it('tanpa ukuran dibaca semua ukuran', () => {
    assert.equal(formatRuleLabel({ minQty: 4, bundlePrice: 100000, sizes: [] }), '100K / 4pcs (semua ukuran)')
  })

  it('harga yang bukan kelipatan 1000 tidak dibulatkan', () => {
    assert.equal(formatBundlePriceShort(92500), '92500')
  })
})

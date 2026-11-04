import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  bundleRuleLabel,
  componentDisplayName,
  isFeeUndecided,
  pendingNoteText,
  splitOrderItems,
} from './order-item-groups'

describe('splitOrderItems', () => {
  it('memisahkan satuan dan paket', () => {
    const { singles, bundles } = splitOrderItems([
      { id: 'a', isBundle: false },
      { id: 'b', isBundle: true },
      { id: 'c', isBundle: false },
    ])
    assert.deepEqual(singles.map((i) => i.id), ['a', 'c'])
    assert.deepEqual(bundles.map((i) => i.id), ['b'])
  })
})

describe('isFeeUndecided', () => {
  it('fee 0 perlu flag, termasuk string "0.00"', () => {
    assert.equal(isFeeUndecided({ fee: 0 }), true)
    assert.equal(isFeeUndecided({ fee: '0.00' }), true)
    assert.equal(isFeeUndecided({ fee: '10000.00' }), false)
  })
})

describe('bundleRuleLabel', () => {
  it('aturan yang sudah dihapus diberi label tidak aktif', () => {
    assert.equal(
      bundleRuleLabel({ isBundle: true, partnerRuleId: null, ruleName: 'Paket 100/3pcs', fee: 0 }),
      'aturan tidak aktif',
    )
  })
  it('aturan aktif memakai nama aturan', () => {
    assert.equal(
      bundleRuleLabel({ isBundle: true, partnerRuleId: 'r1', ruleName: 'Paket 100/3pcs', fee: 0 }),
      'Paket 100/3pcs',
    )
  })
})

describe('pendingNoteText & componentDisplayName', () => {
  it('menulis catatan kekurangan pcs', () => {
    assert.equal(pendingNoteText({ pcsShort: 1, ruleName: 'Paket 100/3pcs' }), '1 pcs lagi untuk Paket 100/3pcs')
  })
  it('menggabungkan nama produk dan varian', () => {
    assert.equal(
      componentDisplayName({ productName: 'Kana Longsleeve Set', size: 'S', variation: 'Marine Cove' }),
      'Kana Longsleeve Set (S / Marine Cove)',
    )
    assert.equal(
      componentDisplayName({ productName: 'Bib', size: null, variation: null }),
      'Bib',
    )
  })
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildItemList, renderMessageTemplate } from './message-template'
import type { MessageTemplateItem } from './message-template'

/**
 * Tes penyusun {listItem} pada template chat WA. Modulnya murni, jadi bisa
 * diuji tanpa database (`pnpm test`).
 */

const ITEMS: Array<MessageTemplateItem> = [
  { name: 'Tas Charles & Keith', qty: 1, originalPrice: 1000000, fee: 100000 },
  { name: 'Sunscreen  Biore', qty: 2, originalPrice: 250000, fee: 25000 },
]

describe('buildItemList', () => {
  it('memecah harga + fee per unit secara default', () => {
    assert.equal(
      buildItemList(ITEMS),
      [
        '• Tas Charles & Keith (1.000.000 + 100.000)',
        '• Sunscreen Biore x2 (250.000 + 25.000)',
      ].join('\n'),
    )
  })

  it('cuma menampilkan harga nett kalau hideFee aktif', () => {
    assert.equal(
      buildItemList(ITEMS, { hideFee: true }),
      [
        '• Tas Charles & Keith (1.100.000)',
        '• Sunscreen Biore x2 (275.000)',
      ].join('\n'),
    )
  })

  it('merapikan nama barang yang mengandung spasi/tab berlebih', () => {
    assert.equal(
      buildItemList([
        { name: 'Kaos  +  Celana', qty: 1, originalPrice: 100000, fee: 5000 },
      ]),
      '• Kaos + Celana (100.000 + 5.000)',
    )
  })
})

describe('renderMessageTemplate', () => {
  it('menyisipkan {listItem} hasil buildItemList tanpa rincian fee', () => {
    const rendered = renderMessageTemplate('{listItem}', {
      customer: 'Nia',
      event: 'Event',
      link: 'https://example.test',
      subtotal: 'Rp 1.500.000',
      fee: 'Rp 150.000',
      total: 'Rp 1.650.000',
      dp: 'Rp 0',
      sisa: 'Rp 1.650.000',
      bank: '',
      bankAccount: '',
      brand: 'ALAKA',
      itemList: buildItemList(ITEMS, { hideFee: true }),
    })

    assert.match(rendered, /Sunscreen Biore x2 \(275\.000\)/)
    assert.doesNotMatch(rendered, /\+ Fee|250\.000 \+ 25\.000/)
  })
})

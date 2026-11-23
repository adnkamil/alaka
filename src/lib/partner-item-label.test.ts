import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { displayBundleLabel, displayItemName, itemDisplayName, partnerItemName, variantLabel } from './partner-item-label'

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

describe('displayItemName', () => {
  it('menampilkan variasi dulu, baru ukuran', () => {
    assert.equal(displayItemName('Kana Set (S / Marine Cove)'), 'Kana Set (Marine Cove / S)')
  })
  it('nama dengan satu opsi atau tanpa opsi tidak berubah', () => {
    assert.equal(displayItemName('Kana Set (S)'), 'Kana Set (S)')
    assert.equal(displayItemName('Kana Set (Marine Cove)'), 'Kana Set (Marine Cove)')
    assert.equal(displayItemName('Kana Set'), 'Kana Set')
  })
})

describe('itemDisplayName', () => {
  it('hanya barang katalog partner yang diurutkan ulang', () => {
    assert.equal(
      itemDisplayName({ name: 'Kana Set (S / Marine Cove)', partnerVariantId: 'v1' }),
      'Kana Set (Marine Cove / S)',
    )
    assert.equal(
      itemDisplayName({ name: 'Tas (Coach / Hitam)', partnerVariantId: null }),
      'Tas (Coach / Hitam)',
    )
  })
  it('di event partner, varian yang sudah dihapus tetap diurutkan', () => {
    assert.equal(
      itemDisplayName({ name: 'Kana Set (S / Marine Cove)', partnerVariantId: null }, true),
      'Kana Set (Marine Cove / S)',
    )
  })
})

describe('displayBundleLabel', () => {
  it('isi paket variasi dulu, nama aturan tetap', () => {
    assert.equal(
      displayBundleLabel('80K / 2pcs: 2× Rok (XL / Hitam) + Jaket (L)'),
      '80K / 2pcs: 2× Rok (Hitam / XL) + Jaket (L)',
    )
    assert.equal(displayBundleLabel('Paket lama'), 'Paket lama')
  })
})

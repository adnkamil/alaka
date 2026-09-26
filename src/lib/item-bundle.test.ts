import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  BUNDLE_SEPARATOR,
  cleanBundleNames,
  isBundleName,
  joinBundleNames,
  splitBundleNames,
} from './item-bundle'

/**
 * Tes logika barang bundling (satu harga untuk beberapa barang), termasuk
 * bolak-balik antara input form (array nama) dan nama tersimpan (satu string).
 * Modulnya murni, jadi bisa diuji tanpa database (`pnpm test`).
 */

describe('pemisah paket', () => {
  it('pakai " + "', () => {
    assert.equal(BUNDLE_SEPARATOR, ' + ')
  })
})

describe('splitBundleNames', () => {
  it('pecah nama paket jadi bagian-bagiannya', () => {
    assert.deepEqual(splitBundleNames('Kaos + Celana + Topi'), [
      'Kaos',
      'Celana',
      'Topi',
    ])
  })

  it('nama tunggal cuma satu bagian', () => {
    assert.deepEqual(splitBundleNames('Kaos'), ['Kaos'])
  })
})

describe('isBundleName', () => {
  it('nama paket terdeteksi, nama tunggal tidak', () => {
    assert.equal(isBundleName('Kaos + Topi'), true)
    assert.equal(isBundleName('Kaos'), false)
    assert.equal(isBundleName(''), false)
    // Pemisah butuh spasi di dua sisi, jadi "Kaos +" (tanpa nama kedua) bukan paket.
    assert.equal(isBundleName('Kaos +'), false)
  })
})

describe('joinBundleNames', () => {
  it('gabung bagian jadi satu nama', () => {
    assert.equal(joinBundleNames(['Kaos', 'Topi']), 'Kaos + Topi')
  })

  it('bagian kosong tetap dibawa (buat slot input yang belum diisi)', () => {
    assert.equal(joinBundleNames(['Kaos', '']), 'Kaos + ')
  })
})

describe('cleanBundleNames', () => {
  it('trim tiap bagian & buang yang kosong', () => {
    assert.equal(cleanBundleNames([' Kaos ', '', ' Topi']), 'Kaos + Topi')
  })

  it('semua kosong -> string kosong', () => {
    assert.equal(cleanBundleNames(['', '  ']), '')
    assert.equal(cleanBundleNames([]), '')
  })
})

describe('bolak-balik form <-> nama tersimpan', () => {
  it('nama paket yang disimpan bisa dipecah & digabung lagi persis sama', () => {
    const stored = 'Kaos + Celana + Topi'
    assert.equal(cleanBundleNames(splitBundleNames(stored)), stored)
  })

  it('nama tunggal tidak ikut berubah', () => {
    const stored = 'Kaos'
    assert.equal(cleanBundleNames(splitBundleNames(stored)), stored)
  })

  it('nama yang kebetulan punya pemisah tetap sama setelah dibuka-tutup paket', () => {
    const stored = 'Kaos + Topi'
    assert.equal(isBundleName(stored), true)
    assert.equal(cleanBundleNames(splitBundleNames(stored)), stored)
  })
})

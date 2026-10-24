import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  firstIncompleteItemIndex,
  itemTitle,
  openIndexAfterRemove,
} from './order-sheet-items'

const single = (name: string, originalPrice = 12000) => ({
  name,
  bundle: false,
  bundleNames: [],
  originalPrice,
})

const bundle = (bundleNames: Array<string>, originalPrice = 100000) => ({
  name: '',
  bundle: true,
  bundleNames,
  originalPrice,
})

describe('itemTitle', () => {
  it('barang tunggal -> nama di-trim', () => {
    assert.equal(
      itemTitle(single('  Singlet Girl - Milk 6-12 M ')),
      'Singlet Girl - Milk 6-12 M',
    )
  })

  it('paket bundling -> digabung "A + B", slot kosong dibuang', () => {
    assert.equal(itemTitle(bundle(['Kaos', '', ' Topi '])), 'Kaos + Topi')
  })

  it('nama belum diisi -> string kosong', () => {
    assert.equal(itemTitle(single('   ')), '')
    assert.equal(itemTitle(bundle(['', ''])), '')
  })
})

describe('firstIncompleteItemIndex', () => {
  it('semua lengkap -> -1', () => {
    assert.equal(
      firstIncompleteItemIndex([single('A'), bundle(['B', 'C'])]),
      -1,
    )
  })

  it('nama kosong -> index barang itu', () => {
    assert.equal(firstIncompleteItemIndex([single('A'), single('')]), 1)
  })

  it('harga asli 0 -> index barang itu (sama seperti required di input harga)', () => {
    assert.equal(firstIncompleteItemIndex([single('A', 0), single('B')]), 0)
  })

  it('yang dikembalikan yang pertama', () => {
    assert.equal(
      firstIncompleteItemIndex([single('A'), single('', 0), single('')]),
      1,
    )
  })

  it('paket bundling tanpa nama satupun -> tidak lengkap', () => {
    assert.equal(firstIncompleteItemIndex([bundle(['', ''])]), 0)
  })
})

describe('openIndexAfterRemove', () => {
  it('tidak ada yang terbuka -> tetap tertutup semua', () => {
    assert.equal(openIndexAfterRemove(null, 1), null)
  })

  it('yang dihapus sedang terbuka -> tertutup semua', () => {
    assert.equal(openIndexAfterRemove(2, 2), null)
  })

  it('yang terbuka ada di bawah yang dihapus -> mundur satu', () => {
    assert.equal(openIndexAfterRemove(3, 1), 2)
  })

  it('yang terbuka ada di atas yang dihapus -> tidak berubah', () => {
    assert.equal(openIndexAfterRemove(0, 2), 0)
  })
})

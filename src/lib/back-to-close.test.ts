import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  isTopmostOpenModal,
  registerOpenModal,
  unregisterOpenModal,
} from './back-to-close'

/**
 * Tes daftar modal terbuka yang dipakai `useBackToClose` buat memutuskan modal
 * mana yang mengambil alih tombol back. Bagian ini murni (tanpa React), jadi
 * bisa diuji tanpa browser (`pnpm test`).
 */

describe('daftar modal terbuka (back-to-close)', () => {
  it('modal yang terakhir dibuka = yang paling atas', () => {
    const bawah = Symbol('bawah')
    const atas = Symbol('atas')

    registerOpenModal(bawah)
    registerOpenModal(atas)

    assert.equal(isTopmostOpenModal(atas), true)
    assert.equal(isTopmostOpenModal(bawah), false)

    unregisterOpenModal(atas)
    unregisterOpenModal(bawah)
  })

  it('back menutup satu-satu dari yang paling atas', () => {
    const pertama = Symbol('pertama')
    const kedua = Symbol('kedua')

    registerOpenModal(pertama)
    registerOpenModal(kedua)

    // Back pertama: cuma modal paling atas yang menanganinya.
    assert.equal(isTopmostOpenModal(kedua), true)
    unregisterOpenModal(kedua)

    // Setelah yang atas tertutup, modal di bawahnya jadi paling atas.
    assert.equal(isTopmostOpenModal(pertama), true)
    unregisterOpenModal(pertama)

    // Semua tertutup -> nggak ada yang menahan back, navigasi jalan normal.
    assert.equal(isTopmostOpenModal(pertama), false)
  })

  it('didaftarkan dua kali tetap dihitung sekali', () => {
    const hanya = Symbol('hanya')

    registerOpenModal(hanya)
    registerOpenModal(hanya)
    unregisterOpenModal(hanya)

    assert.equal(isTopmostOpenModal(hanya), false)
  })

  it('unregister modal yang tidak terdaftar aman', () => {
    const asing = Symbol('asing')
    assert.doesNotThrow(() => unregisterOpenModal(asing))
  })
})

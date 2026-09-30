import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  orderSheetModeFromSearch,
  orderSheetSearch,
} from './order-sheet-search'

/**
 * Tes kontrak URL sheet Tambah/Edit Pesanan — bagian yang bikin tombol back
 * menutup sheet (bukan keluar halaman event). Modulnya murni, jadi bisa diuji
 * tanpa browser (`pnpm test`).
 */

describe('orderSheetModeFromSearch', () => {
  it('tanpa param -> sheet tertutup', () => {
    assert.equal(orderSheetModeFromSearch({}), null)
  })

  it('?addOrder=true -> form tambah pesanan', () => {
    assert.deepEqual(orderSheetModeFromSearch({ addOrder: true }), {
      type: 'create',
    })
  })

  it('?addOrder=false -> tertutup (bukan form tambah)', () => {
    assert.equal(orderSheetModeFromSearch({ addOrder: false }), null)
  })

  it('?editOrder=<id> -> form edit pesanan itu', () => {
    assert.deepEqual(orderSheetModeFromSearch({ editOrder: 'order-1' }), {
      type: 'edit',
      orderId: 'order-1',
    })
  })

  it('?duplicateOrder=<id> -> form ulang pesanan itu', () => {
    assert.deepEqual(orderSheetModeFromSearch({ duplicateOrder: 'order-2' }), {
      type: 'duplicate',
      orderId: 'order-2',
    })
  })

  it('addOrder menang kalau ada dua param sekaligus', () => {
    assert.deepEqual(
      orderSheetModeFromSearch({ addOrder: true, editOrder: 'order-1' }),
      { type: 'create' },
    )
  })
})

describe('orderSheetSearch', () => {
  it('bisa dibaca balik jadi mode yang sama', () => {
    const modes = [
      { type: 'create' },
      { type: 'edit', orderId: 'order-1' },
      { type: 'duplicate', orderId: 'order-2' },
    ] as const

    for (const mode of modes) {
      assert.deepEqual(orderSheetModeFromSearch(orderSheetSearch(mode)), mode)
    }
  })

  it('tiap mode pakai param yang berbeda (nggak saling menimpa)', () => {
    assert.deepEqual(orderSheetSearch({ type: 'create' }), { addOrder: true })
    assert.deepEqual(orderSheetSearch({ type: 'edit', orderId: 'a' }), {
      editOrder: 'a',
    })
    assert.deepEqual(orderSheetSearch({ type: 'duplicate', orderId: 'a' }), {
      duplicateOrder: 'a',
    })
  })
})

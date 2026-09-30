/**
 * Kontrak URL sheet Tambah/Edit Pesanan di halaman Detail Event.
 *
 * Kenapa lewat URL, bukan `useState`? Supaya tombol **back** HP/browser menutup
 * sheet — bukan meninggalkan halaman event. Waktu sheet dibuka, URL-nya jadi
 * `/events/<id>?addOrder=true` (atau `?editOrder=<id>`); back cuma mengembalikan
 * URL ke `/events/<id>` sehingga sheet tertutup dan user tetap di halaman event.
 *
 * `?addOrder=true` juga dipakai halaman pemilih event (`/pesanan/new`) untuk
 * membuka form tambah pesanan langsung setelah user memilih event.
 */

export interface OrderSheetSearch {
  /** Form tambah pesanan baru. */
  addOrder?: boolean
  /** Ulangi pesanan dari order ini (nama pelanggannya diambil dari data order). */
  duplicateOrder?: string
  /** Edit pesanan dengan id ini. */
  editOrder?: string
}

export type OrderSheetMode =
  | { type: 'create' }
  | { type: 'duplicate'; orderId: string }
  | { type: 'edit'; orderId: string }

/**
 * Mode sheet dari search param. `addOrder` menang duluan kalau (entah bagaimana)
 * ada lebih dari satu param sekaligus.
 */
export function orderSheetModeFromSearch(
  search: OrderSheetSearch,
): OrderSheetMode | null {
  if (search.addOrder) return { type: 'create' }
  if (search.duplicateOrder) {
    return { type: 'duplicate', orderId: search.duplicateOrder }
  }
  if (search.editOrder) return { type: 'edit', orderId: search.editOrder }
  return null
}

/** Search param untuk membuka sheet dalam mode tertentu. */
export function orderSheetSearch(mode: OrderSheetMode): OrderSheetSearch {
  if (mode.type === 'create') return { addOrder: true }
  if (mode.type === 'duplicate') return { duplicateOrder: mode.orderId }
  return { editOrder: mode.orderId }
}

/**
 * Export pesanan **satu event** ke file Excel (.xlsx) — dipakai tombol
 * "Export data (Excel)" di menu ⋮ halaman Detail Event.
 *
 * Satu baris file = satu barang, jadi pelanggan yang barangnya lebih dari satu
 * muncul di beberapa baris dengan nomor urut lanjut (1..N). Kolomnya:
 *
 *   No urut | Nama | No WA | Item | Harga | Fee | Qty | Total
 *
 * - `Harga`, `Fee`, dan `Total` ditulis sebagai ANGKA (bukan teks) supaya Excel
 *   bisa langsung dijumlahkan. `Total` = `(harga + fee) × qty` — rumus yang sama
 *   dipakai di seluruh app (`lineTotal` di `order-totals.ts`).
 * - Baris diurutkan per **nama pelanggan** (tanpa membedakan huruf besar/kecil)
 *   supaya hasil export-nya stabil, tidak ikut urutan yang dikirim database.
 *   Urutan barang **di dalam** satu pesanan dibiarkan apa adanya.
 *
 * Modul ini SENGAJA murni (tanpa `db`, tanpa API browser, dan tanpa library
 * Excel): cuma menyusun array-of-arrays yang nanti diumpankan ke
 * `XLSX.utils.aoa_to_sheet()` di halaman event. Jadi isinya bisa diuji tanpa
 * database (`pnpm test`) — sama seperti `order-import.ts`.
 */

import { lineTotal } from './order-totals'
import type { OrderItemLike } from './order-totals'

/** Barang yang ikut diexport — butuh namanya, bukan cuma angkanya. */
export interface ExportItemLike extends OrderItemLike {
  name: string
}

/** Pesanan yang ikut diexport (cukup identitas pelanggan + barangnya). */
export interface ExportOrderLike {
  customerName: string
  customerPhone: string | null
  items: Array<ExportItemLike>
}

/** Header kolom export — urutannya persis seperti yang tampil di file. */
export const ORDER_EXPORT_HEADER = [
  'No urut',
  'Nama',
  'No WA',
  'Item',
  'Harga',
  'Fee',
  'Qty',
  'Total',
]

/**
 * Susun isi file export: baris pertama header, sisanya satu baris per barang
 * (nomor urut 1..N). Hasilnya tinggal diumpankan ke `XLSX.utils.aoa_to_sheet()`.
 */
export function buildOrderExportRows(
  orders: Array<ExportOrderLike>,
): Array<Array<string | number>> {
  const rows: Array<Array<string | number>> = [ORDER_EXPORT_HEADER]

  const sortedOrders = [...orders].sort((a, b) =>
    a.customerName.localeCompare(b.customerName, 'id'),
  )

  let number = 0
  for (const order of sortedOrders) {
    for (const item of order.items) {
      number += 1
      rows.push([
        number,
        order.customerName,
        order.customerPhone ?? '',
        item.name,
        Number(item.originalPrice),
        Number(item.fee),
        item.qty,
        lineTotal(item),
      ])
    }
  }

  return rows
}

/**
 * Nama file export dari nama event: `pesanan-<nama-event>.xlsx`, dengan nama
 * event dibersihkan jadi huruf kecil & tanda hubung (biar aman di semua OS).
 * Event yang namanya cuma simbol/emoji jatuh ke `pesanan-event.xlsx`.
 */
export function orderExportFileName(eventName: string) {
  const slug = eventName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `pesanan-${slug || 'event'}.xlsx`
}

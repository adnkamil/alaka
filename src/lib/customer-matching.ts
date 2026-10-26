/**
 * Pencocokan order → customer.
 *
 * Order cuma menyimpan `customer_name` (varchar) + `customer_phone`, TIDAK ada
 * foreign key ke tabel `customers`. Jadi waktu halaman Invoice/Tagihan butuh
 * data tambahan milik pelanggan (no. HP, dan alamat kirim), order dicocokkan
 * balik ke daftar Customer milik jastiper lewat **nomor HP**.
 *
 * Nama TIDAK dipakai untuk mencocokkan: nama di pesanan bisa berbeda dengan
 * nama di Customer (typo, singkatan, atau label "Nama 6608" dari saran), tapi
 * nomor HP pelanggan yang sama berarti orang yang sama.
 *
 * Modul ini sengaja murni (tanpa `db`) supaya aturannya bisa diuji tanpa
 * database — sama seperti `fee-suggestions.ts` dan `order-totals.ts`.
 */

import { toLocalPhoneNumber } from './format'

/** Bagian customer yang dibutuhkan buat mencocokkan + label saran. */
export interface MatchableCustomer {
  name: string
  phone?: string | null
}

/**
 * Label saran customer: "Nama 4digitTerakhirHP" kalau nomornya ada, kalau tidak
 * cukup namanya. Dipakai `AddOrderSheet` waktu menampilkan/mengisi saran.
 */
export function customerLabel(customer: MatchableCustomer) {
  const last4 = (customer.phone ?? '').replace(/\D/g, '').slice(-4)
  return last4 ? `${customer.name} ${last4}` : customer.name
}

/**
 * Kunci pencocokan nomor: semua bentuk ("0812-3456-6608", "+62 812 3456 6608",
 * "81234566608") diubah ke bentuk lokal "081234566608". Kosong kalau nomor
 * tidak ada atau terlalu pendek untuk dianggap nomor.
 */
export function phoneMatchKey(phone: string | null | undefined): string {
  const local = toLocalPhoneNumber(phone)
  return local.length >= 8 ? local : ''
}

/**
 * Cari customer yang nomor HP-nya sama dengan `customerPhone` sebuah order.
 *
 * - Order tanpa nomor (atau nomornya tidak valid) → `undefined`. Nama tidak
 *   dipakai sebagai cadangan.
 * - Customer tanpa nomor tidak pernah cocok.
 * - Kalau ada lebih dari satu customer dengan nomor yang sama, yang pertama
 *   di daftar yang dipakai.
 *
 * Tidak ketemu = `undefined` (halaman invoice tetap jalan, cuma tanpa info
 * tambahan).
 */
export function findCustomerForOrder<T extends MatchableCustomer>(
  customers: Array<T>,
  customerPhone: string | null | undefined,
): T | undefined {
  const key = phoneMatchKey(customerPhone)
  if (!key) return undefined

  return customers.find((customer) => phoneMatchKey(customer.phone) === key)
}

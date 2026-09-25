/**
 * Pencocokan order → customer.
 *
 * Order cuma menyimpan `customer_name` (varchar) + `customer_phone`, TIDAK ada
 * foreign key ke tabel `customers`. Jadi waktu halaman Invoice/Tagihan butuh
 * data tambahan milik pelanggan (no. HP, dan sekarang alamat kirim), order
 * dicocokkan balik ke daftar Customer milik jastiper lewat **nama**.
 *
 * Aturan pencocokannya mengikuti cara `AddOrderSheet` menuliskan nama waktu
 * jastiper memilih saran customer: `customerLabel()` menghasilkan
 * "Nama 4digitTerakhirHP" (mis. "Budi Santoso 6608"). Karena itu pencocokan
 * dilakukan bertingkat (lihat `findCustomerForOrder`).
 *
 * Modul ini sengaja murni (tanpa `db`) supaya aturannya bisa diuji tanpa
 * database — sama seperti `fee-suggestions.ts` dan `order-totals.ts`.
 */

/** Bagian customer yang dibutuhkan buat mencocokkan + label saran. */
export interface MatchableCustomer {
  name: string
  phone?: string | null
}

/**
 * Label saran customer: "Nama 4digitTerakhirHP" kalau nomornya ada, kalau tidak
 * cukup namanya. Dipakai `AddOrderSheet` waktu menampilkan/mengisi saran dan
 * jadi salah satu bentuk nama yang tersimpan di order.
 */
export function customerLabel(customer: MatchableCustomer) {
  const last4 = (customer.phone ?? '').replace(/\D/g, '').slice(-4)
  return last4 ? `${customer.name} ${last4}` : customer.name
}

/**
 * Cari customer yang cocok dengan `customerName` sebuah order.
 *
 * Urutannya:
 * 1. label lengkap persis (format hasil memilih saran di AddOrderSheet),
 * 2. nama persis,
 * 3. nama yang jadi awalan label — di sini nama TERPANJANG yang menang supaya
 *    order "Budi Santoso 6608" tidak ketangkap customer "Budi" hanya karena
 *    kebetulan namanya juga jadi awalan.
 *
 * Nama yang sudah di-trim dibandingkan apa adanya (case-sensitive) supaya
 * konsisten dengan data yang disimpan; tidak ketemu = `undefined` (halaman
 * invoice tetap jalan, cuma tanpa info tambahan).
 */
export function findCustomerForOrder<T extends MatchableCustomer>(
  customers: Array<T>,
  customerName: string,
): T | undefined {
  const target = customerName.trim()
  if (!target) return undefined

  const byLabel = customers.find(
    (customer) => customerLabel(customer) === target,
  )
  if (byLabel) return byLabel

  const byName = customers.find((customer) => customer.name === target)
  if (byName) return byName

  return customers
    .filter((customer) => target.startsWith(`${customer.name} `))
    .sort((a, b) => b.name.length - a.name.length)[0]
}

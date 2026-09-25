import type { PaymentStatus } from './order-totals'

/**
 * Aturan "gabungkan pesanan" untuk satu pelanggan di satu event.
 *
 * Waktu jastiper mencatat pesanan kedua untuk pelanggan yang sama, barangnya
 * digabung ke pesanan yang masih belum lunas — jadi satu pelanggan tetap satu
 * tagihan, satu status pembayaran, dan invoice-nya nggak kebelah dua.
 *
 * Pesanan yang sudah **lunas/dikirim** TIDAK digabung: barang baru belum tentu
 * ikut lunas, jadi lebih aman jadi pesanan baru.
 *
 * Modul ini murni (tanpa `db`) supaya aturannya bisa diuji tanpa database —
 * dipakai `createOrder` di `orders-functions.ts`.
 */

export interface MergeableItem {
  name: string
  originalPrice: number
  fee: number
  qty: number
  obtained?: boolean
}

/**
 * Bagian pesanan yang dibutuhkan buat memilih tujuan penggabungan. Sengaja
 * dipisah dari `MergeableItem` supaya baris hasil query `db` bisa langsung
 * dilewatkan ke `findMergeTarget` tanpa mapping.
 */
export interface MergeTargetOrder {
  id: string
  customerName: string
  paymentStatus: PaymentStatus
  createdAt: Date | string
}

/** Pesanan lengkap (dipakai tes & buat dokumentasi bentuk datanya). */
export interface MergeableOrder extends MergeTargetOrder {
  paidAmount: string | number
  items: Array<MergeableItem>
}

/** Nama pelanggan dinormalkan: trim, spasi ganda dirapatkan, jadi huruf kecil. */
export function normalizeCustomerName(name: string) {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Pelanggan dianggap sama kalau namanya sama setelah dinormalkan. Sengaja TIDAK
 * mencocokkan lewat digit nomor HP (label saran "Nama 4digit") supaya dua
 * pelanggan beda yang kebetulan bernama sama tidak ikut tergabung.
 */
export function isSameCustomer(a: string, b: string) {
  return normalizeCustomerName(a) === normalizeCustomerName(b)
}

/** Pesanan yang masih boleh ditambahi barang. */
export function isMergeableStatus(status: PaymentStatus) {
  return status === 'unpaid' || status === 'dp'
}

function toTime(value: Date | string) {
  return value instanceof Date ? value.getTime() : new Date(value).getTime()
}

/**
 * Pesanan yang jadi tujuan penggabungan: nama pelanggan sama, statusnya masih
 * belum lunas, dan yang paling baru di antara kandidat (kalau karena data lama
 * ada lebih dari satu, barang baru masuk ke yang terakhir dibuat).
 */
export function findMergeTarget<T extends MergeTargetOrder>(
  orders: Array<T>,
  customerName: string,
): T | undefined {
  return orders
    .filter(
      (order) =>
        isSameCustomer(order.customerName, customerName) &&
        isMergeableStatus(order.paymentStatus),
    )
    .sort((a, b) => toTime(b.createdAt) - toTime(a.createdAt))[0]
}

/**
 * Gabungkan barang lama + barang baru. Baris dengan nama, harga asli, dan fee
 * yang sama persis dijumlah qty-nya (barang & harga sama = barang yang sama
 * juga, jadi cukup satu baris), sisanya ditambahkan sebagai baris baru.
 */
export function mergeItemLines(
  existing: Array<MergeableItem>,
  incoming: Array<MergeableItem>,
): Array<MergeableItem> {
  const merged = existing.map((item) => ({ ...item }))

  for (const item of incoming) {
    const sameLine = merged.find(
      (candidate) =>
        candidate.name === item.name &&
        Number(candidate.originalPrice) === Number(item.originalPrice) &&
        Number(candidate.fee) === Number(item.fee),
    )

    if (sameLine) {
      sameLine.qty += item.qty
      // Barang yang sudah didapat tetap "didapat" — baris ini barang yang sama,
      // cuma jumlahnya bertambah.
      sameLine.obtained = Boolean(sameLine.obtained || item.obtained)
      continue
    }

    merged.push({ ...item })
  }

  return merged
}

/**
 * Nominal terbayar setelah digabung: uang yang sudah masuk tetap dihitung,
 * ditambah yang baru dibayar untuk barang baru, tapi tidak boleh melebihi total
 * baru (total bisa berubah kalau barang ditambah/dihapus).
 */
export function mergePaidAmount(
  existingPaid: string | number,
  incomingPaid: number,
  mergedTotal: number,
) {
  return Math.min(Math.max(Number(existingPaid) + incomingPaid, 0), mergedTotal)
}

/**
 * Aturan uang pesanan jastip: `fee` berlaku PER UNIT, jadi total satu baris
 * barang = (harga asli + fee) * qty.
 *
 * Contoh: barang 30.000 + fee 4.000, qty 2 -> (30.000 + 4.000) x 2 = 68.000.
 *
 * Semua perhitungan uang pesanan (form, detail event, invoice, laporan) harus
 * lewat helper ini supaya hasilnya konsisten.
 */
export interface OrderItemLike {
  originalPrice: string | number
  fee: string | number
  qty: number
}

/** Total satu baris item: (harga asli + fee) * qty. */
export function lineTotal(item: OrderItemLike) {
  return (Number(item.originalPrice) + Number(item.fee)) * item.qty
}

/** Ringkasan pesanan: subtotal (harga barang), total fee, dan grand total. */
export function summarizeItems(items: Array<OrderItemLike>) {
  let subtotal = 0
  let totalFee = 0

  for (const item of items) {
    subtotal += Number(item.originalPrice) * item.qty
    totalFee += Number(item.fee) * item.qty
  }

  return { subtotal, totalFee, total: subtotal + totalFee }
}

/** Jumlah unit barang (sum qty), dipakai buat label "n item". */
export function totalUnits(items: Array<OrderItemLike>) {
  return items.reduce((sum, item) => sum + item.qty, 0)
}

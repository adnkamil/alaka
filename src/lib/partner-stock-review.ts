// Pembantu UI halaman cek partner untuk stok. Sengaja tanpa import database.

export type StockReviewRow = {
  id: string
  qty: number
  partnerVariantId: string | null
  /** Stok varian saat ini; null kalau barang tidak terhubung ke katalog. */
  stock: number | null
}

/**
 * Isian awal "Dapat": sebesar yang diminta, dibatasi sisa stok varian. Baris
 * dengan varian yang sama berbagi stok sesuai urutan.
 */
export function allocateApproved(
  rows: Array<StockReviewRow>,
): Record<string, number> {
  const left = new Map<string, number>()
  const result: Record<string, number> = {}
  for (const row of rows) {
    if (!row.partnerVariantId || row.stock === null) {
      result[row.id] = row.qty
      continue
    }
    const remaining = left.get(row.partnerVariantId) ?? row.stock
    const take = Math.max(0, Math.min(row.qty, remaining))
    result[row.id] = take
    left.set(row.partnerVariantId, remaining - take)
  }
  return result
}

/** Id baris yang varian-nya melebihi stok kalau jumlah "Dapat" dijumlahkan. */
export function overStockRowIds(
  rows: Array<StockReviewRow>,
  approved: Record<string, number>,
): Set<string> {
  const totals = new Map<string, number>()
  for (const row of rows) {
    if (!row.partnerVariantId || row.stock === null) continue
    totals.set(
      row.partnerVariantId,
      (totals.get(row.partnerVariantId) ?? 0) + (approved[row.id] ?? 0),
    )
  }
  const over = new Set<string>()
  for (const row of rows) {
    if (!row.partnerVariantId || row.stock === null) continue
    if ((totals.get(row.partnerVariantId) ?? 0) > row.stock) over.add(row.id)
  }
  return over
}

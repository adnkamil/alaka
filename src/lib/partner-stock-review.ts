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

/**
 * Bagikan satu jumlah "Dapat" ke baris-barisnya, urut FIFO: baris pertama
 * diisi penuh dulu, sisanya ke baris berikutnya. Aturan yang sama dengan
 * `allocateApproved`, jadi hasil isian manual dan otomatis konsisten.
 */
export function splitApproved(
  rows: Array<{ id: string; qty: number }>,
  total: number,
): Record<string, number> {
  let left = Math.max(0, Math.floor(total) || 0)
  const result: Record<string, number> = {}
  for (const row of rows) {
    const take = Math.min(row.qty, left)
    result[row.id] = take
    left -= take
  }
  return result
}

export type DisplayEntry<T> =
  | { kind: 'row'; row: T }
  | { kind: 'group'; key: string; rows: Array<T> }

/**
 * Susun baris untuk tabel: baris dengan kunci yang sama digabung jadi satu
 * entri `group` di posisi kemunculan pertamanya. Baris tanpa kunci (null),
 * atau satu-satunya dengan kuncinya, tetap baris biasa.
 */
export function buildDisplayEntries<T>(
  rows: Array<T>,
  keyOf: (row: T) => string | null,
): Array<DisplayEntry<T>> {
  const byKey = new Map<string, Array<T>>()
  for (const row of rows) {
    const key = keyOf(row)
    if (key === null) continue
    const list = byKey.get(key) ?? []
    list.push(row)
    byKey.set(key, list)
  }
  const entries: Array<DisplayEntry<T>> = []
  const emitted = new Set<string>()
  for (const row of rows) {
    const key = keyOf(row)
    const group = key === null ? undefined : byKey.get(key)
    if (key === null || !group || group.length < 2) {
      entries.push({ kind: 'row', row })
    } else if (!emitted.has(key)) {
      emitted.add(key)
      entries.push({ kind: 'group', key, rows: group })
    }
  }
  return entries
}

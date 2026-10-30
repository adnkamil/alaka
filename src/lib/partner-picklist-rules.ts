// Rekap barang untuk partner, murni tanpa `db`. Input: baris barang satuan dan
// komponen bundle yang sudah dikumpulkan dari database.

export type PicklistSourceRow = {
  productName: string
  size: string | null
  variation: string | null
  /** null = barang satuan. Selain itu id aturan paket. */
  ruleId: string | null
  ruleName: string | null
  brandName: string
  qty: number
}

export type PicklistRow = {
  productName: string
  size: string | null
  variation: string | null
  ruleId: string | null
  ruleName: string | null
  total: number
  byJastiper: Array<{ brandName: string; qty: number }>
}

/**
 * Jumlahkan qty per produk, ukuran, variasi, dan sumbernya (satuan atau aturan
 * paket tertentu). Hasilnya diurutkan supaya mudah dibaca saat menyiapkan barang.
 * `ruleFilter`: null = semua; "satuan" = hanya satuan; id = hanya aturan itu.
 */
export function buildPicklist(
  rows: Array<PicklistSourceRow>,
  ruleFilter: string | null = null,
): Array<PicklistRow> {
  const map = new Map<string, PicklistRow>()
  for (const row of rows) {
    if (ruleFilter === 'satuan' && row.ruleId !== null) continue
    if (ruleFilter !== null && ruleFilter !== 'satuan' && row.ruleId !== ruleFilter) continue
    if (row.qty <= 0) continue

    const key = [row.ruleId ?? 'satuan', row.productName, row.size ?? '', row.variation ?? ''].join('\u0001')
    let entry = map.get(key)
    if (!entry) {
      entry = {
        productName: row.productName,
        size: row.size,
        variation: row.variation,
        ruleId: row.ruleId,
        ruleName: row.ruleName,
        total: 0,
        byJastiper: [],
      }
      map.set(key, entry)
    }
    entry.total += row.qty
    const jastiper = entry.byJastiper.find((j) => j.brandName === row.brandName)
    if (jastiper) jastiper.qty += row.qty
    else entry.byJastiper.push({ brandName: row.brandName, qty: row.qty })
  }

  return [...map.values()]
    .map((e) => ({
      ...e,
      byJastiper: e.byJastiper.sort((a, b) => a.brandName.localeCompare(b.brandName)),
    }))
    .sort(
      (a, b) =>
        a.productName.localeCompare(b.productName) ||
        (a.size ?? '').localeCompare(b.size ?? '', 'id') ||
        (a.variation ?? '').localeCompare(b.variation ?? '', 'id') ||
        (a.ruleName ?? '').localeCompare(b.ruleName ?? ''),
    )
}

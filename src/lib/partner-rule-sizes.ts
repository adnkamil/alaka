// Pengelompokan ukuran aturan paket per produk. Logika murni, tanpa database.
import type { RuleProductSizes } from './partner-pricing'

export type RuleProductSizeRow = {
  ruleId: string
  partnerProductId: string
  sizeName: string
}

/** Ukuran satu aturan per produk, dari baris tabel partner_rule_product_sizes. */
export function productSizesForRule(
  rows: Array<RuleProductSizeRow>,
  ruleId: string,
): RuleProductSizes {
  const result: RuleProductSizes = {}
  for (const row of rows) {
    if (row.ruleId !== ruleId) continue
    ;(result[row.partnerProductId] ??= []).push(row.sizeName)
  }
  return result
}

/**
 * Ukuran yang boleh dipilih untuk sebuah produk di aturan: harus bagian dari
 * ukuran produk itu, dan wajib dipilih minimal satu kalau produknya punya
 * ukuran. Mengembalikan pesan error, atau null kalau valid.
 */
export function validateProductSizes(
  productName: string,
  productSizes: Array<string>,
  selected: Array<string>,
): string | null {
  const unknown = selected.filter((size) => !productSizes.includes(size))
  if (unknown.length > 0) {
    return `${productName} tidak punya ukuran ${unknown.join(', ')}.`
  }
  if (productSizes.length > 0 && selected.length === 0) {
    return `Pilih minimal satu ukuran untuk ${productName}.`
  }
  return null
}

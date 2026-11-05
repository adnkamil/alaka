// Label aturan paket yang ditampilkan ke partner dan jastiper, misalnya
// "100K / 2pcs (S, M, L)". Dipakai juga untuk nama aturan saat impor.

/** Harga paket ringkas: 100000 -> "100K", 92500 -> "92500". */
export function formatBundlePriceShort(price: number): string {
  const rounded = Math.round(price)
  return rounded % 1000 === 0 ? `${rounded / 1000}K` : String(rounded)
}

export function formatRuleLabel(rule: {
  minQty: number
  bundlePrice: number
  sizes: Array<string>
}): string {
  const scope = rule.sizes.length > 0 ? `(${rule.sizes.join(', ')})` : '(semua ukuran)'
  return `${formatBundlePriceShort(rule.bundlePrice)} / ${rule.minQty}pcs ${scope}`
}

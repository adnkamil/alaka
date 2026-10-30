// Logika murni untuk ketersediaan produk di aturan paket. Satu produk hanya
// boleh di satu aturan, jadi produk yang sudah dipakai aturan lain disembunyikan
// dari pilihan, kecuali kalau aturan itu adalah aturan yang sedang diubah.

export type RuleLink = { id: string; productIds: Array<string> }

/** Peta produk -> id aturan yang memuatnya. */
export function ruleIdByProduct(rules: Array<RuleLink>): Map<string, string> {
  const map = new Map<string, string>()
  for (const rule of rules) {
    for (const productId of rule.productIds) map.set(productId, rule.id)
  }
  return map
}

/**
 * Produk yang boleh dipilih untuk aturan `currentRuleId` (null = aturan baru):
 * produk yang belum punya aturan, ditambah produk yang memang sudah ada di
 * aturan ini.
 */
export function selectableProducts<T extends { id: string }>(
  products: Array<T>,
  rules: Array<RuleLink>,
  currentRuleId: string | null,
): Array<T> {
  const owner = ruleIdByProduct(rules)
  return products.filter((p) => {
    const ruleOfProduct = owner.get(p.id)
    return ruleOfProduct === undefined || ruleOfProduct === currentRuleId
  })
}

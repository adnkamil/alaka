// Logika murni pemilihan ukuran di form aturan paket: ukuran dipilih per produk,
// dan ukuran yang sudah dipakai aturan lain (untuk produk yang sama) tidak bisa
// dipilih lagi. Tanpa database dan tanpa React, jadi bisa diuji langsung.

export type FormOtherRule = {
  id: string
  name: string
  productIds: Array<string>
  productSizes: Record<string, Array<string>>
}

export type FormProductSizes = { id: string; name: string; sizes: Array<string> }

/** Ukuran produk yang sudah dipakai aturan lain: nama ukuran -> nama aturan. */
export function sizesUsedByOtherRules(
  rules: Array<FormOtherRule>,
  ruleId: string | undefined,
  productId: string,
): Map<string, string> {
  const used = new Map<string, string>()
  for (const rule of rules) {
    if (rule.id === ruleId) continue
    for (const size of rule.productSizes[productId] ?? []) used.set(size, rule.name)
  }
  return used
}

/** Produk tanpa ukuran hanya boleh ada di satu aturan. */
function usedByOtherRule(
  rules: Array<FormOtherRule>,
  ruleId: string | undefined,
  productId: string,
): boolean {
  return rules.some((r) => r.id !== ruleId && r.productIds.includes(productId))
}

/** Ukuran produk yang masih bebas (belum dipakai aturan lain). */
export function freeSizes(
  product: FormProductSizes,
  rules: Array<FormOtherRule>,
  ruleId: string | undefined,
): Array<string> {
  const used = sizesUsedByOtherRules(rules, ruleId, product.id)
  return product.sizes.filter((size) => !used.has(size))
}

/** Produk boleh ditambahkan kalau masih punya ukuran bebas (atau tanpa ukuran dan belum di aturan lain). */
export function canAddProduct(
  product: FormProductSizes,
  rules: Array<FormOtherRule>,
  ruleId: string | undefined,
): boolean {
  if (product.sizes.length === 0) return !usedByOtherRule(rules, ruleId, product.id)
  return freeSizes(product, rules, ruleId).length > 0
}

export function toggleSize(current: Array<string> | undefined, size: string): Array<string> {
  const list = current ?? []
  return list.includes(size) ? list.filter((s) => s !== size) : [...list, size]
}

/**
 * Pilih atau lepas satu ukuran untuk banyak produk sekaligus. Hanya produk yang
 * punya ukuran itu dan ukuran itu masih bebas yang ikut berubah. Kalau semua
 * produk yang bisa sudah memilihnya, ukuran dilepas dari semuanya; selain itu
 * ditambahkan ke semuanya.
 */
export function bulkToggleSize(
  selected: Record<string, Array<string>>,
  products: Array<FormProductSizes>,
  rules: Array<FormOtherRule>,
  ruleId: string | undefined,
  size: string,
): Record<string, Array<string>> {
  const targets = products.filter(
    (p) => p.sizes.includes(size) && freeSizes(p, rules, ruleId).includes(size),
  )
  if (targets.length === 0) return selected
  const allOn = targets.every((p) => (selected[p.id] ?? []).includes(size))
  const next = { ...selected }
  for (const p of targets) {
    const current = next[p.id] ?? []
    next[p.id] = allOn
      ? current.filter((s) => s !== size)
      : current.includes(size)
        ? current
        : [...current, size]
  }
  return next
}

/** Produk berukuran yang belum punya ukuran terpilih. */
export function productsMissingSizes(
  products: Array<FormProductSizes>,
  selected: Record<string, Array<string>>,
): Array<FormProductSizes> {
  return products.filter((p) => p.sizes.length > 0 && (selected[p.id] ?? []).length === 0)
}

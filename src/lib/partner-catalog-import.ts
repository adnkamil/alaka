// Rencana impor katalog partner dari berkas JSON. Murni (tanpa db) supaya bisa
// diuji. Script scripts/import-partner-catalog.ts yang menulis ke database.
import { assertRuleScopesNoOverlap, PricingError } from './partner-pricing'
import { formatRuleLabel } from './partner-rule-label'

export type RawSatuan = { sizes: Array<string>; price: number | null; derived?: boolean }
export type RawRule = { sizes: Array<string>; minQty: number; bundlePrice: number }
export type RawProduct = {
  page: number | Array<number>
  name: string
  sizes: Array<string>
  motifs: Array<string>
  satuan: Array<RawSatuan>
  rules: Array<RawRule>
  needsReview: Array<string>
  hasVariants?: boolean
  price?: number
}
export type RawCatalog = { partnerEmail: string; products: Array<RawProduct> }

export type PlannedVariant = {
  ukuran: string | null
  variasi: string | null
  price: number
}
export type PlannedRule = {
  name: string
  minQty: number
  bundlePrice: number
  sizes: Array<string>
  /** Semua produk yang memakai aturan ini (aturan yang sama digabung). */
  productNames: Array<string>
}
export type PlannedProduct = {
  name: string
  hasVariants: boolean
  price: number | null
  sizes: Array<string>
  motifs: Array<string>
  variants: Array<PlannedVariant>
}
export type ImportPlan = {
  products: Array<PlannedProduct>
  /** Aturan paket unik, sudah digabung lintas produk. */
  rules: Array<PlannedRule>
  errors: Array<string>
}

function priceForSize(satuan: Array<RawSatuan>, size: string | null): number | null {
  // Entri tanpa ukuran berlaku untuk semua ukuran.
  const exact = satuan.find((s) => size !== null && s.sizes.includes(size))
  if (exact) return exact.price
  const any = satuan.find((s) => s.sizes.length === 0)
  return any ? any.price : null
}

export function planCatalogImport(raw: RawCatalog): ImportPlan {
  const errors: Array<string> = []
  const products: Array<PlannedProduct> = []
  const rawRules: Array<RawRule & { product: string }> = []
  const seen = new Set<string>()

  for (const p of raw.products) {
    const label = `${p.name} (hal. ${p.page})`
    if (seen.has(p.name)) errors.push(`${label}: nama produk ganda`)
    seen.add(p.name)
    if (p.needsReview.length > 0) {
      errors.push(`${label}: masih perlu dicek: ${p.needsReview.join('; ')}`)
    }

    const hasVariants = p.sizes.length > 0 || p.motifs.length > 0
    const variants: Array<PlannedVariant> = []
    let price: number | null = null

    if (!hasVariants) {
      price = p.satuan[0]?.price ?? p.price ?? null
      if (price === null) errors.push(`${label}: harga tidak ada`)
    } else {
      const sizeList: Array<string | null> = p.sizes.length ? p.sizes : [null]
      const motifList: Array<string | null> = p.motifs.length ? p.motifs : [null]
      for (const size of sizeList) {
        const unit = priceForSize(p.satuan, size)
        if (unit === null) {
          errors.push(`${label}: harga satuan ukuran ${size ?? '-'} belum ada`)
          continue
        }
        for (const motif of motifList) {
          variants.push({ ukuran: size, variasi: motif, price: unit })
        }
      }
    }

    for (const r of p.rules) rawRules.push({ product: p.name, ...r })

    products.push({
      name: p.name,
      hasVariants,
      price,
      sizes: p.sizes,
      motifs: p.motifs,
      variants,
    })
  }

  // Aturan dengan jumlah pcs, harga paket, dan rentang ukuran yang sama
  // digabung jadi satu aturan yang memuat banyak produk.
  const rules: Array<PlannedRule> = []
  const keyOf = (r: RawRule) => `${r.minQty}|${r.bundlePrice}|${[...r.sizes].sort().join(',')}`
  const byKey = new Map<string, PlannedRule>()
  for (const r of rawRules) {
    const key = keyOf(r)
    const existing = byKey.get(key)
    if (existing) {
      if (!existing.productNames.includes(r.product)) existing.productNames.push(r.product)
      continue
    }
    const rule: PlannedRule = {
      name: formatRuleLabel({ minQty: r.minQty, bundlePrice: r.bundlePrice, sizes: r.sizes }),
      minQty: r.minQty,
      bundlePrice: r.bundlePrice,
      sizes: r.sizes,
      productNames: [r.product],
    }
    byKey.set(key, rule)
    rules.push(rule)
  }

  // Rentang ukuran aturan per produk tidak boleh tumpang tindih.
  const perProduct = new Map<string, Array<{ id: string; name: string; productIds: Array<string>; sizes: Array<string> }>>()
  for (const [i, rule] of rules.entries()) {
    for (const name of rule.productNames) {
      const list = perProduct.get(name) ?? []
      list.push({ id: `rule${i}`, name: rule.name, productIds: [name], sizes: rule.sizes })
      perProduct.set(name, list)
    }
  }
  for (const [name, list] of perProduct) {
    try {
      assertRuleScopesNoOverlap(list)
    } catch (error) {
      if (error instanceof PricingError) errors.push(`${name}: ${error.message}`)
      else throw error
    }
  }

  return { products, rules, errors }
}

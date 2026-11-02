// Logika murni untuk menyimpan varian produk partner. Tanpa `db`, bisa diuji.
// Aturan utama: varian yang sudah pernah dipesan tidak dihapus, hanya
// dinonaktifkan supaya riwayat pesanan tetap bisa ditelusuri.

export type VariantInput = {
  /** Nilai ukuran, atau null kalau produk tidak punya grup ukuran. */
  size: string | null
  /** Nilai variasi, atau null kalau produk tidak punya grup variasi. */
  variation: string | null
  price: number
}

export type ExistingVariant = {
  id: string
  size: string | null
  variation: string | null
  isActive: boolean
  /** true kalau varian ini pernah ada di pesanan (termasuk di dalam bundle). */
  hasOrders: boolean
}

export type VariantPlan = {
  insert: Array<VariantInput>
  update: Array<{ id: string; price: number }>
  reactivate: Array<string>
  deactivate: Array<string>
  remove: Array<string>
}

export class VariantPlanError extends Error {}

export function variantKey(size: string | null, variation: string | null): string {
  return `${size ?? ''}\u0001${variation ?? ''}`
}

/** Validasi nama grup dan daftar varian yang dikirim partner. */
export function validateVariantInput(input: {
  sizes: Array<string>
  variations: Array<string>
  variants: Array<VariantInput>
}): void {
  for (const [label, names] of [
    ['Ukuran', input.sizes],
    ['Variasi', input.variations],
  ] as const) {
    const seen = new Set<string>()
    for (const raw of names) {
      const name = raw.trim()
      if (!name) throw new VariantPlanError(`Nilai ${label} tidak boleh kosong.`)
      if (name.length > 60) throw new VariantPlanError(`Nilai ${label} terlalu panjang.`)
      const lower = name.toLowerCase()
      if (seen.has(lower)) throw new VariantPlanError(`Nilai ${label} "${name}" dobel.`)
      seen.add(lower)
    }
  }

  const sizeSet = new Set(input.sizes.map((s) => s.trim()))
  const variationSet = new Set(input.variations.map((s) => s.trim()))
  const keys = new Set<string>()
  for (const v of input.variants) {
    if (input.sizes.length > 0 && (v.size === null || !sizeSet.has(v.size))) {
      throw new VariantPlanError('Setiap varian harus punya ukuran yang terdaftar.')
    }
    if (input.sizes.length === 0 && v.size !== null) {
      throw new VariantPlanError('Produk ini tidak punya grup ukuran.')
    }
    if (input.variations.length > 0 && (v.variation === null || !variationSet.has(v.variation))) {
      throw new VariantPlanError('Setiap varian harus punya variasi yang terdaftar.')
    }
    if (input.variations.length === 0 && v.variation !== null) {
      throw new VariantPlanError('Produk ini tidak punya grup variasi.')
    }
    if (!Number.isFinite(v.price) || v.price < 0) {
      throw new VariantPlanError('Harga varian tidak valid.')
    }
    const key = variantKey(v.size, v.variation)
    if (keys.has(key)) throw new VariantPlanError('Kombinasi varian dobel.')
    keys.add(key)
  }
}

/**
 * Bandingkan varian yang ada dengan yang diminta partner, lalu tentukan apa
 * yang harus dibuat, diubah, diaktifkan lagi, dinonaktifkan, atau dihapus.
 */
export function planVariantChanges(
  existing: Array<ExistingVariant>,
  desired: Array<VariantInput>,
): VariantPlan {
  const existingByKey = new Map(
    existing.map((v) => [variantKey(v.size, v.variation), v]),
  )
  const desiredKeys = new Set(
    desired.map((v) => variantKey(v.size, v.variation)),
  )

  const plan: VariantPlan = {
    insert: [],
    update: [],
    reactivate: [],
    deactivate: [],
    remove: [],
  }

  for (const want of desired) {
    const match = existingByKey.get(variantKey(want.size, want.variation))
    if (!match) {
      plan.insert.push(want)
      continue
    }
    plan.update.push({ id: match.id, price: want.price })
    if (!match.isActive) plan.reactivate.push(match.id)
  }

  for (const have of existing) {
    if (desiredKeys.has(variantKey(have.size, have.variation))) continue
    if (have.hasOrders) {
      if (have.isActive) plan.deactivate.push(have.id)
    } else {
      plan.remove.push(have.id)
    }
  }

  return plan
}

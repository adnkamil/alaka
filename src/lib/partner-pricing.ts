// Logika murni untuk aturan paket partner dan HPP. Tidak menyentuh database,
// sehingga bisa diuji langsung. Semua nominal dalam rupiah bulat.

export type PricingRule = {
  id: string
  name: string
  /** Jumlah pcs per paket, misalnya 3. */
  minQty: number
  /** HPP per paket, misalnya 100000. */
  bundlePrice: number
  /** Produk induk yang masuk aturan ini. */
  productIds: Array<string>
}

export type BundleComponent = {
  partnerProductId: string
  partnerVariantId: string
  productName: string
  size: string | null
  variation: string | null
  /** Jumlah barang ini dalam satu paket. */
  qty: number
}

export type BundleLine = {
  isBundle: true
  partnerRuleId: string
  /** HPP per paket (sama dengan bundlePrice aturan). */
  hpp: number
  /** Harga jual per paket. Default = harga paket, bisa diubah jastiper. */
  originalPrice: number
  /** Fee per paket. */
  fee: number
  /** Jumlah paket. */
  qty: number
  /** Nama gabungan untuk tampilan ringkas, misalnya "A + B + C". */
  name: string
  components: Array<BundleComponent>
}

export type SingleLine = {
  isBundle: false
  partnerVariantId: string | null
  /** HPP per unit: harga varian, atau harga induk untuk produk tanpa varian. */
  hpp: number
  originalPrice: number
  fee: number
  qty: number
  name: string
}

export class PricingError extends Error {}

/**
 * Satu produk induk hanya boleh masuk satu aturan. Melempar error kalau ada
 * produk yang muncul di lebih dari satu aturan.
 */
export function assertRuleProductsUnique(
  rules: Array<Pick<PricingRule, 'id' | 'productIds'>>,
): void {
  const owner = new Map<string, string>()
  for (const rule of rules) {
    for (const productId of rule.productIds) {
      const prev = owner.get(productId)
      if (prev && prev !== rule.id) {
        throw new PricingError(
          `Produk ${productId} sudah ada di aturan ${prev}.`,
        )
      }
      owner.set(productId, rule.id)
    }
  }
}

/**
 * Membuat satu baris bundle. Setiap komponen harus berasal dari produk di
 * aturan itu, dan total qty komponen harus tepat sama dengan minQty aturan.
 */
export function buildBundleLine(
  rule: PricingRule,
  components: Array<BundleComponent>,
  input: { sellPrice: number; fee: number; bundleCount: number },
): BundleLine {
  if (components.length === 0) {
    throw new PricingError('Paket harus berisi minimal satu barang.')
  }
  if (!Number.isInteger(input.bundleCount) || input.bundleCount < 1) {
    throw new PricingError('Jumlah paket harus bilangan bulat minimal 1.')
  }
  if (input.sellPrice < 0 || input.fee < 0) {
    throw new PricingError('Harga jual dan fee tidak boleh negatif.')
  }

  const allowed = new Set(rule.productIds)
  for (const component of components) {
    if (!allowed.has(component.partnerProductId)) {
      throw new PricingError(
        `${component.productName} tidak termasuk dalam aturan "${rule.name}".`,
      )
    }
    if (!Number.isInteger(component.qty) || component.qty < 1) {
      throw new PricingError(`Qty ${component.productName} tidak valid.`)
    }
  }

  const pcsPerBundle = components.reduce((sum, c) => sum + c.qty, 0)
  if (pcsPerBundle !== rule.minQty) {
    throw new PricingError(
      `Paket "${rule.name}" harus berisi tepat ${rule.minQty} pcs, bukan ${pcsPerBundle}.`,
    )
  }

  return {
    isBundle: true,
    partnerRuleId: rule.id,
    hpp: rule.bundlePrice,
    originalPrice: input.sellPrice,
    fee: input.fee,
    qty: input.bundleCount,
    name: components.map((c) => c.productName).join(' + '),
    components,
  }
}

/** Satu baris barang satuan. HPP diambil dari harga varian/induk saat dicatat. */
export function buildSingleLine(input: {
  partnerVariantId: string | null
  hpp: number
  sellPrice: number
  fee: number
  qty: number
  name: string
}): SingleLine {
  if (!Number.isInteger(input.qty) || input.qty < 1) {
    throw new PricingError('Qty harus bilangan bulat minimal 1.')
  }
  if (input.hpp < 0 || input.sellPrice < 0 || input.fee < 0) {
    throw new PricingError('Nominal tidak boleh negatif.')
  }
  return {
    isBundle: false,
    partnerVariantId: input.partnerVariantId,
    hpp: input.hpp,
    originalPrice: input.sellPrice,
    fee: input.fee,
    qty: input.qty,
    name: input.name,
  }
}

/**
 * Keuntungan jastiper dari satu baris = fee + (harga jual - HPP), dikali qty.
 * Konsisten dengan rumus total baris yang sudah ada: (harga + fee) * qty.
 */
export function lineProfit(line: SingleLine | BundleLine): number {
  return (line.originalPrice - line.hpp + line.fee) * line.qty
}

/** Total yang ditagihkan ke pemesan untuk satu baris (tanpa HPP). */
export function lineInvoiceTotal(line: SingleLine | BundleLine): number {
  return (line.originalPrice + line.fee) * line.qty
}

/**
 * Total pcs yang harus disiapkan partner untuk satu baris bundle, per komponen.
 * Dipakai untuk rekap di sisi partner.
 */
export function bundlePcsByComponent(
  line: BundleLine,
): Array<{ partnerVariantId: string; pcs: number }> {
  return line.components.map((c) => ({
    partnerVariantId: c.partnerVariantId,
    pcs: c.qty * line.qty,
  }))
}

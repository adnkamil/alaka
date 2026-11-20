// Pemaketan tagihan partner (server-only, menerima `tx`). Aturan murni ada di
// `partner-invoice-pooling.ts`. Dipakai saat membuat tagihan, pratinjaunya, dan
// daftar submit, supaya angkanya sama.
import { and, asc, eq, inArray } from 'drizzle-orm'
import {
  partnerPricingRules,
  partnerRuleProductSizes,
  partnerRuleProducts,
  partnerSubscriptions,
} from '../db/schema'
import { hasPartnerPro } from './partner-entitlement'
import {
  applyPoolToBilling,
  poolSinglesIntoBundles,
} from './partner-invoice-pooling'
import { loadVariantInfo } from './partner-paket-queries'
import { productSizesForRule } from './partner-rule-sizes'
import type {
  PoolResult,
  PooledBundle,
  PoolRule,
  PoolSingle,
} from './partner-invoice-pooling'
import type { OrderTx } from './order-status-queries'
import type { PoolableSingle, SubmitBilling } from './submit-billing'

export type PooledInvoiceBilling = {
  bySubmission: Map<string, SubmitBilling>
  /** Jumlah paket yang terbentuk. */
  bundleCount: number
  /** Jumlah harga satuan dikurangi harga paket. Bisa negatif. */
  saving: number
  /** Paket yang terbentuk, lengkap dengan isinya per barang. */
  bundles: Array<PooledBundle>
}

/** Aturan paket aktif partner, berurutan menurut posisi. */
async function loadActiveRules(
  tx: OrderTx,
  partnerId: string,
): Promise<Array<PoolRule>> {
  const rules = await tx
    .select({
      id: partnerPricingRules.id,
      name: partnerPricingRules.name,
      minQty: partnerPricingRules.minQty,
      bundlePrice: partnerPricingRules.bundlePrice,
    })
    .from(partnerPricingRules)
    .where(
      and(
        eq(partnerPricingRules.partnerId, partnerId),
        eq(partnerPricingRules.isActive, true),
      ),
    )
    .orderBy(asc(partnerPricingRules.position), asc(partnerPricingRules.createdAt))
  if (rules.length === 0) return []

  const ruleIds = rules.map((r) => r.id)
  const productRows = await tx
    .select({
      ruleId: partnerRuleProducts.ruleId,
      productId: partnerRuleProducts.partnerProductId,
    })
    .from(partnerRuleProducts)
    .where(inArray(partnerRuleProducts.ruleId, ruleIds))
  const sizeRows = await tx
    .select({
      ruleId: partnerRuleProductSizes.ruleId,
      partnerProductId: partnerRuleProductSizes.partnerProductId,
      sizeName: partnerRuleProductSizes.sizeName,
    })
    .from(partnerRuleProductSizes)
    .where(inArray(partnerRuleProductSizes.ruleId, ruleIds))

  return rules.map((r) => ({
    id: r.id,
    name: r.name,
    minQty: r.minQty,
    bundlePrice: Number(r.bundlePrice),
    productIds: productRows
      .filter((p) => p.ruleId === r.id)
      .map((p) => p.productId),
    productSizes: productSizesForRule(sizeRows, r.id),
  }))
}

/**
 * Jadikan pcs disetujui paket menurut aturan aktif partner, dengan harga aturan
 * saat ini. Tidak menulis apa pun. Partner tanpa PRO tidak mendapat pemaketan.
 * `groupOf` menentukan pcs mana yang dipaketkan bersama, dari id submitnya.
 * Bawaannya semua pcs satu kelompok (satu tagihan, satu jastiper).
 */
export async function poolInvoiceBilling(
  tx: OrderTx,
  input: {
    partnerId: string
    bySubmission: Map<string, SubmitBilling>
    poolable: Array<PoolableSingle>
    groupOf?: (submissionId: string) => string
  },
): Promise<PooledInvoiceBilling> {
  const { partnerId, bySubmission, poolable, groupOf = () => '' } = input
  const unchanged: PooledInvoiceBilling = {
    bySubmission,
    bundleCount: 0,
    saving: 0,
    bundles: [],
  }
  // Satu pcs saja tidak mungkin jadi paket.
  if (poolable.reduce((sum, s) => sum + s.qty, 0) < 2) return unchanged

  const subs = await tx
    .select({
      status: partnerSubscriptions.status,
      startedAt: partnerSubscriptions.startedAt,
      endsAt: partnerSubscriptions.endsAt,
    })
    .from(partnerSubscriptions)
    .where(eq(partnerSubscriptions.partnerId, partnerId))
  if (!hasPartnerPro(subs)) return unchanged

  const rules = await loadActiveRules(tx, partnerId)
  if (rules.length === 0) return unchanged

  const variants = await loadVariantInfo(
    tx,
    poolable.map((s) => s.variantId),
  )
  const groups = new Map<string, Array<PoolSingle>>()
  for (const s of poolable) {
    const info = variants.get(s.variantId)
    if (!info) continue
    const key = groupOf(s.submissionId)
    const group = groups.get(key) ?? []
    group.push({
      itemId: s.itemId,
      submissionId: s.submissionId,
      label: s.label,
      productId: info.productId,
      size: info.size,
      qty: s.qty,
      unitPrice: s.unitPrice,
      addedAt: s.addedAt,
    })
    groups.set(key, group)
  }

  const pool: PoolResult = {
    bundles: [],
    consumed: new Map(),
    saving: 0,
    notes: new Map(),
  }
  for (const singles of groups.values()) {
    const part = poolSinglesIntoBundles(singles, rules)
    pool.bundles.push(...part.bundles)
    for (const [id, qty] of part.consumed) pool.consumed.set(id, qty)
    for (const [id, note] of part.notes) pool.notes.set(id, note)
    pool.saving += part.saving
  }
  // Tanpa paket pun alasan satuan tetap ditampilkan (mis. di luar aturan).
  if (pool.bundles.length === 0 && pool.notes.size === 0) return unchanged
  return {
    bySubmission: applyPoolToBilling(bySubmission, pool),
    bundleCount: pool.bundles.length,
    saving: pool.saving,
    bundles: pool.bundles,
  }
}

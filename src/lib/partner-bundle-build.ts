import { and, eq, inArray } from 'drizzle-orm'
import {
  events,
  partnerEventProducts,
  partnerOptionGroups,
  partnerOptionValues,
  partnerPricingRules,
  partnerProducts,
  partnerRuleProducts,
  partnerRuleProductSizes,
  partnerVariantValues,
  partnerVariants,
} from '../db/schema'
import { partnerItemName, variantLabel } from './partner-item-label'
import { productSizesForRule } from './partner-rule-sizes'
import { aggregateStockDemand, findStockShortages, formatStockShortages } from './partner-stock'
import {
  PricingError,
  buildBundleLine,
  type BundleComponent,
  type BundleLine,
  type PricingRule,
} from './partner-pricing'

/** Bagian baca dari db (db biasa atau transaksi). */
type Reader = Pick<typeof import('../db').db, 'query' | 'select'>

export type BundleRequest = {
  eventId: string
  ruleId: string
  components: Array<{ partnerVariantId: string; qty: number }>
  sellPrice: number
  fee: number
  bundleCount: number
}

/**
 * Validasi satu paket dari sisi jastiper dan bentuk barisnya. Semua nilai HPP
 * dan komponen diambil dari database. Dipakai oleh addPartnerBundle dan, nanti,
 * pembuatan/edit pesanan yang memuat paket.
 */
export async function buildPartnerBundle(
  tx: Reader,
  brandId: string,
  data: BundleRequest,
): Promise<{
  event: { id: string; calendarEventId: string | null }
  rule: { id: string }
  line: BundleLine
}> {
  const event = await tx.query.events.findFirst({
    where: and(eq(events.id, data.eventId), eq(events.brandId, brandId)),
  })
  if (!event) throw new Error('Event tidak ditemukan')
  if (!event.isActive) {
    throw new Error('Event ini nonaktif, jadi tidak bisa menambah pesanan.')
  }
  if (!event.calendarEventId) {
    throw new Error(
      'Event ini tidak terhubung ke event partner, jadi paket tidak bisa dipakai.',
    )
  }

  const rule = await tx.query.partnerPricingRules.findFirst({
    where: eq(partnerPricingRules.id, data.ruleId),
  })
  if (!rule || !rule.isActive) {
    throw new Error('Aturan paket tidak ditemukan atau nonaktif.')
  }

  const ruleProductRows = await tx
    .select({ productId: partnerRuleProducts.partnerProductId })
    .from(partnerRuleProducts)
    .where(eq(partnerRuleProducts.ruleId, rule.id))
  const ruleProductIds = new Set(ruleProductRows.map((r) => r.productId))
  const ruleSizeRows = await tx
    .select()
    .from(partnerRuleProductSizes)
    .where(eq(partnerRuleProductSizes.ruleId, rule.id))

  // Produk yang dibeli harus memang dijual di event partner ini.
  const eventProductRows = await tx
    .select({ productId: partnerEventProducts.productId })
    .from(partnerEventProducts)
    .where(eq(partnerEventProducts.calendarEventId, event.calendarEventId))
  const eventProductIds = new Set(eventProductRows.map((r) => r.productId))

  const variantIds = data.components.map((c) => c.partnerVariantId)
  const variantRows = await tx
    .select({
      id: partnerVariants.id,
      productId: partnerVariants.partnerProductId,
      isActive: partnerVariants.isActive,
      stockQty: partnerVariants.stockQty,
      productName: partnerProducts.name,
    })
    .from(partnerVariants)
    .innerJoin(
      partnerProducts,
      eq(partnerProducts.id, partnerVariants.partnerProductId),
    )
    .where(inArray(partnerVariants.id, variantIds))
  const variantById = new Map(variantRows.map((v) => [v.id, v]))

  const valueRows = await tx
    .select({
      variantId: partnerVariantValues.variantId,
      type: partnerOptionGroups.type,
      name: partnerOptionValues.name,
    })
    .from(partnerVariantValues)
    .innerJoin(
      partnerOptionValues,
      eq(partnerOptionValues.id, partnerVariantValues.optionValueId),
    )
    .innerJoin(
      partnerOptionGroups,
      eq(partnerOptionGroups.id, partnerOptionValues.optionGroupId),
    )
    .where(inArray(partnerVariantValues.variantId, variantIds))

  const components: Array<BundleComponent> = []
  for (const input of data.components) {
    const variant = variantById.get(input.partnerVariantId)
    if (!variant || !variant.isActive) {
      throw new Error('Varian tidak ditemukan atau nonaktif.')
    }
    if (!eventProductIds.has(variant.productId)) {
      throw new Error(`${variant.productName} tidak dijual di event ini.`)
    }
    const values = valueRows.filter((v) => v.variantId === variant.id)
    components.push({
      partnerProductId: variant.productId,
      partnerVariantId: variant.id,
      productName: variant.productName,
      size: values.find((v) => v.type === 'ukuran')?.name ?? null,
      variation: values.find((v) => v.type === 'variasi')?.name ?? null,
      qty: input.qty,
    })
  }

  // Cek stok komponen (pengurangan terjadi saat partner menekan "Selesai dicek").
  const shortages = findStockShortages(
    aggregateStockDemand(
      components.map((c) => ({ variantId: c.partnerVariantId, qty: c.qty })),
    ),
    new Map(
      components.map((c) => [
        c.partnerVariantId,
        {
          name: partnerItemName(
            c.productName,
            variantLabel({ size: c.size, variation: c.variation }),
          ),
          stock: variantById.get(c.partnerVariantId)?.stockQty ?? 0,
        },
      ]),
    ),
  )
  if (shortages.length > 0) throw new Error(formatStockShortages(shortages) + '.')

  const pricingRule: PricingRule = {
    id: rule.id,
    name: rule.name,
    minQty: rule.minQty,
    bundlePrice: Number(rule.bundlePrice),
    productIds: [...ruleProductIds],
    productSizes: productSizesForRule(ruleSizeRows, rule.id),
  }

  let line
  try {
    line = buildBundleLine(pricingRule, components, {
      sellPrice: data.sellPrice,
      fee: data.fee,
      bundleCount: data.bundleCount,
    })
  } catch (error) {
    if (error instanceof PricingError) throw new Error(error.message)
    throw error
  }

  return { event, rule, line }
}

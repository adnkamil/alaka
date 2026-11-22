import { and, eq, inArray } from 'drizzle-orm'
import { db } from '../db'
import {
  calendarEvents,
  partnerEventProducts,
  partnerOptionGroups,
  partnerOptionValues,
  partnerProducts,
  partnerVariantValues,
  partnerVariants,
} from '../db/schema'
import {
  partnerItemName,
  variantLabel

} from './partner-item-label'
import type { PartnerEventItemCatalog, PartnerItemRule } from './partner-item-label';
import { partnerPricingRules, partnerRuleProducts, partnerRuleProductSizes } from '../db/schema';
import { productSizesForRule } from './partner-rule-sizes';
import { partnerProductPhotoUrl } from './partner-product-rules';
import {
  aggregateStockDemand,
  findStockShortages,
  formatStockShortages,
} from './partner-stock'

/**
 * Katalog produk partner yang dibawa ke satu event (produk aktif + varian aktif).
 * Event tanpa partner: `isPartnerEvent: false`, dan form tetap memakai input bebas.
 */
export async function loadEventPartnerItemCatalog(
  calendarEventId: string | null,
): Promise<PartnerEventItemCatalog> {
  if (!calendarEventId) return { isPartnerEvent: false, products: [] }

  const calendarEvent = await db.query.calendarEvents.findFirst({
    where: eq(calendarEvents.id, calendarEventId),
    columns: { partnerId: true },
  })
  if (!calendarEvent?.partnerId) return { isPartnerEvent: false, products: [] }

  const productRows = await db
    .select({
      id: partnerProducts.id,
      name: partnerProducts.name,
      photoUpdatedAt: partnerProducts.photoUpdatedAt,
    })
    .from(partnerEventProducts)
    .innerJoin(partnerProducts, eq(partnerProducts.id, partnerEventProducts.productId))
    .where(
      and(
        eq(partnerEventProducts.calendarEventId, calendarEventId),
        eq(partnerProducts.isActive, true),
      ),
    )
    .orderBy(partnerProducts.name)
  if (productRows.length === 0) return { isPartnerEvent: true, products: [] }

  const variantRows = await db
    .select({
      id: partnerVariants.id,
      productId: partnerVariants.partnerProductId,
      price: partnerVariants.price,
      stockQty: partnerVariants.stockQty,
    })
    .from(partnerVariants)
    .where(
      and(
        inArray(
          partnerVariants.partnerProductId,
          productRows.map((p) => p.id),
        ),
        eq(partnerVariants.isActive, true),
      ),
    )

  // Aturan paket aktif untuk produk di event ini.
  const productIds = productRows.map((p) => p.id)
  const ruleProductRows = await db
    .select({ ruleId: partnerRuleProducts.ruleId, productId: partnerRuleProducts.partnerProductId })
    .from(partnerRuleProducts)
    .where(inArray(partnerRuleProducts.partnerProductId, productIds))
  const ruleRows = ruleProductRows.length
    ? await db
        .select({
          id: partnerPricingRules.id,
          name: partnerPricingRules.name,
          minQty: partnerPricingRules.minQty,
          bundlePrice: partnerPricingRules.bundlePrice,
          isActive: partnerPricingRules.isActive,
        })
        .from(partnerPricingRules)
        .where(
          and(
            inArray(partnerPricingRules.id, [...new Set(ruleProductRows.map((r) => r.ruleId))]),
            eq(partnerPricingRules.partnerId, calendarEvent.partnerId),
          ),
        )
    : []
  const activeRules = ruleRows.filter((r) => r.isActive)
  const activeRuleIds = new Set(activeRules.map((r) => r.id))
  // Satu produk bisa masuk beberapa aturan; semua ikut ditampilkan.
  const sizeRows = activeRuleIds.size
    ? await db
        .select()
        .from(partnerRuleProductSizes)
        .where(inArray(partnerRuleProductSizes.ruleId, [...activeRuleIds]))
    : []
  const rulesByProduct = new Map<string, Array<PartnerItemRule>>()
  for (const row of ruleProductRows) {
    const rule = activeRules.find((r) => r.id === row.ruleId)
    if (!rule || !activeRuleIds.has(row.ruleId)) continue
    const list = rulesByProduct.get(row.productId) ?? []
    if (!list.some((r) => r.id === rule.id)) {
      list.push({
        id: rule.id,
        name: rule.name,
        minQty: rule.minQty,
        bundlePrice: Number(rule.bundlePrice),
        productSizes: productSizesForRule(sizeRows, rule.id),
      })
    }
    rulesByProduct.set(row.productId, list)
  }

  const valueRows = variantRows.length
    ? await db
        .select({
          variantId: partnerVariantValues.variantId,
          type: partnerOptionGroups.type,
          value: partnerOptionValues.name,
          imageUrl: partnerOptionValues.imageUrl,
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
        .where(
          inArray(
            partnerVariantValues.variantId,
            variantRows.map((v) => v.id),
          ),
        )
    : []

  const optionsByVariant = new Map<
    string,
    { size: string | null; variation: string | null }
  >()
  for (const row of valueRows) {
    const current = optionsByVariant.get(row.variantId) ?? {
      size: null,
      variation: null,
    }
    if (row.type === 'ukuran') current.size = row.value
    if (row.type === 'variasi') current.variation = row.value
    optionsByVariant.set(row.variantId, current)
  }

  // Foto per variasi, dikelompokkan per produk: productId -> (nama variasi -> URL).
  const productOfVariant = new Map(variantRows.map((v) => [v.id, v.productId]))
  const variationPhotosByProduct = new Map<string, Record<string, string>>()
  for (const row of valueRows) {
    if (row.type !== 'variasi' || !row.imageUrl) continue
    const productId = productOfVariant.get(row.variantId)
    if (!productId) continue
    const photos = variationPhotosByProduct.get(productId) ?? {}
    photos[row.value] = row.imageUrl
    variationPhotosByProduct.set(productId, photos)
  }

  return {
    isPartnerEvent: true,
    rules: activeRules.map((r) => ({
      id: r.id,
      name: r.name,
      minQty: r.minQty,
      bundlePrice: Number(r.bundlePrice),
      productSizes: productSizesForRule(sizeRows, r.id),
    })),
    products: productRows
      .map((product) => ({
        id: product.id,
        name: product.name,
        photoUrl: partnerProductPhotoUrl(product.id, product.photoUpdatedAt),
        variationPhotos: variationPhotosByProduct.get(product.id) ?? {},
        rules: rulesByProduct.get(product.id) ?? [],
        variants: variantRows
          .filter((v) => v.productId === product.id)
          .map((v) => ({
            id: v.id,
            label: variantLabel(
              optionsByVariant.get(v.id) ?? { size: null, variation: null },
            ),
            size: optionsByVariant.get(v.id)?.size ?? null,
            variation: optionsByVariant.get(v.id)?.variation ?? null,
            price: Number(v.price),
            stock: v.stockQty,
          })),
      }))
      .filter((product) => product.variants.length > 0),
  }
}

export interface EventItemInput {
  name: string
  originalPrice: number
  fee: number
  qty: number
  obtained: boolean
  partnerVariantId?: string | null
}

export interface ResolvedEventItem extends EventItemInput {
  partnerVariantId: string | null
  /** Harga beli jastiper (HPP) per unit, diambil dari varian partner. */
  hpp: number | null
}

/**
 * Memastikan barang sesuai aturan event. Di event partner, setiap barang harus
 * memakai varian dari katalog event itu, dan namanya diambil dari katalog (bukan
 * dari klien). Di event lain, `partnerVariantId` diabaikan.
 * `originalPrice` tetap dari klien: itu harga jual yang boleh diubah jastiper.
 */
export async function resolveEventItems(
  calendarEventId: string | null,
  inputs: Array<EventItemInput>,
): Promise<Array<ResolvedEventItem>> {
  const catalog = await loadEventPartnerItemCatalog(calendarEventId)

  if (!catalog.isPartnerEvent) {
    return inputs.map((item) => ({ ...item, partnerVariantId: null, hpp: null }))
  }

  const variantById = new Map<
    string,
    { productName: string; label: string; price: number; stock: number }
  >()
  for (const product of catalog.products) {
    for (const variant of product.variants) {
      variantById.set(variant.id, {
        productName: product.name,
        label: variant.label,
        price: variant.price,
        stock: variant.stock,
      })
    }
  }

  // Stok hanya dicek di sini (pagar awal); pengurangannya terjadi saat partner
  // menekan "Selesai dicek". Barang yang sudah disetujui tidak ikut dicek ulang
  // karena pemanggil hanya mengirim barang baru.
  const demand = aggregateStockDemand(
    inputs.map((item) => ({ variantId: item.partnerVariantId, qty: item.qty })),
  )
  const shortages = findStockShortages(
    demand,
    new Map(
      [...variantById].map(([id, v]) => [
        id,
        { name: partnerItemName(v.productName, v.label), stock: v.stock },
      ]),
    ),
  )
  if (shortages.length > 0) throw new Error(formatStockShortages(shortages) + '.')

  return inputs.map((item) => {
    const variantId = item.partnerVariantId
    const variant = variantId ? variantById.get(variantId) : undefined
    if (!variant) {
      throw new Error(
        'Barang harus dipilih dari katalog partner. Nama barang tidak bisa diketik bebas di event ini.',
      )
    }
    return {
      ...item,
      name: partnerItemName(variant.productName, variant.label),
      partnerVariantId: variantId ?? null,
      hpp: variant.price,
    }
  })
}

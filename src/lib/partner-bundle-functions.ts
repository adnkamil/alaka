import { createServerFn } from '@tanstack/react-start'
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import {
  events,
  items,
  partnerEventProducts,
  partnerOptionGroups,
  partnerOptionValues,
  partnerPricingRules,
  partnerProducts,
  partnerRuleProducts,
  partnerSubscriptions,
  partnerVariantValues,
  partnerVariants,
} from '../db/schema'
import { getSessionUser } from './auth'
import { brandIdOf } from './brand'
import { recalculateOrderStatus } from './order-status-queries'
import { hasPartnerPro } from './partner-entitlement'

async function requireUser() {
  const user = await getSessionUser()
  if (!user) throw new Error('Belum login')
  return user
}

const updateBundlePricingSchema = z.object({
  itemId: z.uuid(),
  sellPrice: z.number().nonnegative(),
  fee: z.number().nonnegative(),
})

/**
 * Mengubah harga jual dan fee sebuah bundle partner. Isi, qty, dan HPP tidak
 * bisa diubah lewat aksi ini.
 */
export const updatePartnerBundlePricing = createServerFn({ method: 'POST' })
  .validator(updateBundlePricingSchema)
  .handler(async ({ data }) => {
    const { db } = await import('../db')
    const user = await requireUser()
    const brandId = brandIdOf(user)

    return db.transaction(async (tx) => {
      const row = await tx.query.items.findFirst({
        where: eq(items.id, data.itemId),
        with: { order: { with: { event: true } } },
      })
      if (!row || row.order.event.brandId !== brandId) {
        throw new Error('Barang tidak ditemukan')
      }
      // Paket dikenali dari isBundle, supaya paket yang aturannya sudah dihapus
      // partner tetap bisa diubah harganya.
      if (!row.isBundle) {
        throw new Error('Barang ini bukan paket')
      }

      await tx
        .update(items)
        .set({
          originalPrice: data.sellPrice.toString(),
          fee: data.fee.toString(),
        })
        .where(eq(items.id, data.itemId))

      await recalculateOrderStatus(tx, row.orderId)
      return { orderId: row.orderId }
    })
  })

const eventCatalogSchema = z.object({ eventId: z.uuid() })

/**
 * Katalog paket untuk sebuah event jastiper: aturan yang punya produk di event
 * itu, serta produk dan varian aktif yang bisa dipilih. Dipakai form "Pakai
 * paket". Validasi final tetap di `addPartnerBundle`.
 */
export const getEventPartnerCatalog = createServerFn({ method: 'GET' })
  .validator(eventCatalogSchema)
  .handler(async ({ data }) => {
    const { db } = await import('../db')
    const user = await requireUser()
    const brandId = brandIdOf(user)

    const event = await db.query.events.findFirst({
      where: and(eq(events.id, data.eventId), eq(events.brandId, brandId)),
    })
    if (!event) throw new Error('Event tidak ditemukan')
    if (!event.calendarEventId) {
      return { enabled: false as const, rules: [], products: [], variants: [] }
    }

    const eventProductRows = await db
      .select({ productId: partnerEventProducts.productId })
      .from(partnerEventProducts)
      .where(eq(partnerEventProducts.calendarEventId, event.calendarEventId))
    const eventProductIds = eventProductRows.map((r) => r.productId)
    if (eventProductIds.length === 0) {
      return { enabled: false as const, rules: [], products: [], variants: [] }
    }

    // Aturan yang punya setidaknya satu produk di event ini.
    const ruleLinks = await db
      .select({ ruleId: partnerRuleProducts.ruleId })
      .from(partnerRuleProducts)
      .where(inArray(partnerRuleProducts.partnerProductId, eventProductIds))
    const ruleIds = [...new Set(ruleLinks.map((r) => r.ruleId))]
    if (ruleIds.length === 0) {
      return { enabled: false as const, rules: [], products: [], variants: [] }
    }

    const ruleRows = await db.query.partnerPricingRules.findMany({
      where: and(
        inArray(partnerPricingRules.id, ruleIds),
        eq(partnerPricingRules.isActive, true),
      ),
    })
    const allRuleProducts = await db
      .select()
      .from(partnerRuleProducts)
      .where(inArray(partnerRuleProducts.ruleId, ruleIds))

    // Aturan hanya ditampilkan kalau partner-nya PRO. Tanpa ini, tombol
    // "Pakai paket" muncul lalu gagal saat disimpan.
    const proPartnerIds = new Set<string>()
    for (const partnerId of new Set(ruleRows.map((r) => r.partnerId))) {
      const subs = await db
        .select({
          status: partnerSubscriptions.status,
          startedAt: partnerSubscriptions.startedAt,
          endsAt: partnerSubscriptions.endsAt,
        })
        .from(partnerSubscriptions)
        .where(eq(partnerSubscriptions.partnerId, partnerId))
      if (hasPartnerPro(subs)) proPartnerIds.add(partnerId)
    }
    const visibleRuleRows = ruleRows.filter((r) => proPartnerIds.has(r.partnerId))

    const rules = visibleRuleRows.map((rule) => ({
      id: rule.id,
      name: rule.name,
      minQty: rule.minQty,
      bundlePrice: Number(rule.bundlePrice),
      productIds: allRuleProducts
        .filter((rp) => rp.ruleId === rule.id)
        .map((rp) => rp.partnerProductId),
    }))

    // Hanya produk yang ada di event dan di salah satu aturan aktif.
    const catalogProductIds = [
      ...new Set(
        rules
          .flatMap((r) => r.productIds)
          .filter((id) => eventProductIds.includes(id)),
      ),
    ]
    const productRows = catalogProductIds.length
      ? await db
          .select({ id: partnerProducts.id, name: partnerProducts.name })
          .from(partnerProducts)
          .where(inArray(partnerProducts.id, catalogProductIds))
      : []

    const variantRows = catalogProductIds.length
      ? await db
          .select({
            id: partnerVariants.id,
            productId: partnerVariants.partnerProductId,
            price: partnerVariants.price,
          })
          .from(partnerVariants)
          .where(
            and(
              inArray(partnerVariants.partnerProductId, catalogProductIds),
              eq(partnerVariants.isActive, true),
            ),
          )
      : []

    const valueRows = variantRows.length
      ? await db
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
          .where(
            inArray(
              partnerVariantValues.variantId,
              variantRows.map((v) => v.id),
            ),
          )
      : []

    return {
      enabled: rules.length > 0,
      rules,
      products: productRows,
      variants: variantRows.map((v) => {
        const values = valueRows.filter((x) => x.variantId === v.id)
        return {
          id: v.id,
          productId: v.productId,
          size: values.find((x) => x.type === 'ukuran')?.name ?? null,
          variation: values.find((x) => x.type === 'variasi')?.name ?? null,
          price: Number(v.price),
        }
      }),
    }
  })

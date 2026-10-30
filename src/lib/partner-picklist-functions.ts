import { createServerFn } from '@tanstack/react-start'
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { requirePartner } from './partner-auth'
import { buildPicklist, type PicklistSourceRow } from './partner-picklist-rules'

const idSchema = z.uuid()

/**
 * Rekap barang untuk satu event partner: jumlah qty per produk, ukuran, dan
 * variasi, dipisah per sumber (satuan atau aturan paket). Bundle dipecah jadi
 * barang per produk. Data pemesan, harga jual, dan fee tidak ikut.
 */
export const getPartnerEventPicklist = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      calendarEventId: idSchema,
      /** null = semua, "satuan" = hanya satuan, atau id aturan paket. */
      ruleFilter: z.string().nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const partner = await requirePartner()
    const { db } = await import('../db')
    const schema = await import('../db/schema')
    const {
      calendarEvents,
      events,
      orders,
      items,
      itemComponents,
      brands,
      partnerPricingRules,
      partnerProducts,
      partnerVariants,
      partnerVariantValues,
      partnerOptionValues,
      partnerOptionGroups,
    } = schema

    const [calendarEvent] = await db
      .select({ id: calendarEvents.id })
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.id, data.calendarEventId),
          eq(calendarEvents.partnerId, partner.id),
        ),
      )
    if (!calendarEvent) throw new Error('Event tidak ditemukan')

    const rules = await db
      .select({ id: partnerPricingRules.id, name: partnerPricingRules.name })
      .from(partnerPricingRules)
      .where(eq(partnerPricingRules.partnerId, partner.id))
    const ruleNameById = new Map(rules.map((r) => [r.id, r.name]))

    const jastiperEvents = await db
      .select({ id: events.id, brandId: events.brandId })
      .from(events)
      .where(eq(events.calendarEventId, data.calendarEventId))
    if (jastiperEvents.length === 0) {
      return { rules, rows: [] }
    }
    const brandIds = [...new Set(jastiperEvents.map((e) => e.brandId))]
    const brandRows = await db
      .select({ id: brands.id, name: brands.name })
      .from(brands)
      .where(inArray(brands.id, brandIds))
    const brandNameById = new Map(brandRows.map((b) => [b.id, b.name ?? 'Jastiper']))
    const brandByEventId = new Map(jastiperEvents.map((e) => [e.id, e.brandId]))

    const orderRows = await db
      .select({ id: orders.id, eventId: orders.eventId })
      .from(orders)
      .where(inArray(orders.eventId, jastiperEvents.map((e) => e.id)))
    const brandByOrderId = new Map(
      orderRows.map((o) => [o.id, brandNameById.get(brandByEventId.get(o.eventId)!) ?? 'Jastiper']),
    )

    const itemRows = orderRows.length
      ? await db
          .select()
          .from(items)
          .where(inArray(items.orderId, orderRows.map((o) => o.id)))
      : []

    // Varian partner: nama produk, ukuran, dan variasi untuk barang satuan.
    const satuanVariantIds = [
      ...new Set(
        itemRows
          .filter((i) => !i.isBundle && i.partnerVariantId)
          .map((i) => i.partnerVariantId!),
      ),
    ]
    const variantMeta = new Map<string, { productName: string; size: string | null; variation: string | null }>()
    if (satuanVariantIds.length) {
      const variants = await db
        .select({
          id: partnerVariants.id,
          productName: partnerProducts.name,
        })
        .from(partnerVariants)
        .innerJoin(partnerProducts, eq(partnerProducts.id, partnerVariants.partnerProductId))
        .where(inArray(partnerVariants.id, satuanVariantIds))
      const links = await db
        .select({
          variantId: partnerVariantValues.variantId,
          name: partnerOptionValues.name,
          type: partnerOptionGroups.type,
        })
        .from(partnerVariantValues)
        .innerJoin(partnerOptionValues, eq(partnerOptionValues.id, partnerVariantValues.optionValueId))
        .innerJoin(partnerOptionGroups, eq(partnerOptionGroups.id, partnerOptionValues.optionGroupId))
        .where(inArray(partnerVariantValues.variantId, satuanVariantIds))
      for (const v of variants) {
        const mine = links.filter((l) => l.variantId === v.id)
        variantMeta.set(v.id, {
          productName: v.productName,
          size: mine.find((l) => l.type === 'ukuran')?.name ?? null,
          variation: mine.find((l) => l.type === 'variasi')?.name ?? null,
        })
      }
    }

    const bundleItemIds = itemRows.filter((i) => i.isBundle).map((i) => i.id)
    const componentRows = bundleItemIds.length
      ? await db
          .select()
          .from(itemComponents)
          .where(inArray(itemComponents.itemId, bundleItemIds))
      : []

    const source: Array<PicklistSourceRow> = []
    for (const item of itemRows) {
      const orderBrand = brandByOrderId.get(item.orderId) ?? 'Jastiper'
      if (item.isBundle) {
        for (const c of componentRows.filter((c) => c.itemId === item.id)) {
          source.push({
            productName: c.productName,
            size: c.size,
            variation: c.variation,
            ruleId: item.partnerRuleId,
            ruleName: item.partnerRuleId ? (ruleNameById.get(item.partnerRuleId) ?? null) : null,
            brandName: orderBrand,
            qty: item.qty * c.qty,
          })
        }
      } else if (item.partnerVariantId && variantMeta.has(item.partnerVariantId)) {
        const meta = variantMeta.get(item.partnerVariantId)!
        source.push({
          productName: meta.productName,
          size: meta.size,
          variation: meta.variation,
          ruleId: null,
          ruleName: null,
          brandName: orderBrand,
          qty: item.qty,
        })
      }
    }

    const filter = data.ruleFilter ?? null
    return { rules, rows: buildPicklist(source, filter) }
  })

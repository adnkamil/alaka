import { createServerFn } from '@tanstack/react-start'
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { requirePartner } from './partner-auth'
import { partnerOwnsEvent } from './partner-event-queries'

const idSchema = z.uuid()

export type JastiperDetailRow = {
  /** Varian produk partner; dipakai untuk mencocokkan baris dengan hasil pengecekan. */
  variantId: string | null
  productName: string
  size: string | null
  variation: string | null
  /** Null untuk barang satuan. */
  ruleId: string | null
  ruleName: string | null
  qty: number
  /** Harga produk yang ditentukan partner (per pcs). */
  unitPrice: number
}

type JastiperEventDetail = {
  brandId: string
  brandName: string
  waNumber: string | null
  orderCount: number
  totalPcs: number
  satuanPcs: number
  paketPcs: number
  paketCount: number
  totalAmount: number
  rows: Array<JastiperDetailRow>
}

/**
 * Hitung detail satu jastiper di satu event. Harga memakai harga varian
 * produk partner (per pcs), termasuk pcs dari paket. Nama pemesan, harga jual,
 * dan fee tidak ikut.
 */
async function loadJastiperEventDetail(
  partnerId: string,
  jastiperEventId: string,
  brand: { id: string; name: string | null; waNumber: string | null },
): Promise<JastiperEventDetail> {
  const { db } = await import('../db')
  const schema = await import('../db/schema')
  const {
    orders,
    items,
    itemComponents,
    partnerPricingRules,
    partnerProducts,
    partnerVariants,
    partnerVariantValues,
    partnerOptionValues,
    partnerOptionGroups,
  } = schema

  const orderRows = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.eventId, jastiperEventId))

  const rules = await db
    .select({ id: partnerPricingRules.id, name: partnerPricingRules.name })
    .from(partnerPricingRules)
    .where(eq(partnerPricingRules.partnerId, partnerId))
  const ruleNameById = new Map(rules.map((r) => [r.id, r.name]))

  const itemRows = orderRows.length
    ? await db
        .select()
        .from(items)
        .where(
          inArray(
            items.orderId,
            orderRows.map((o) => o.id),
          ),
        )
    : []

  const variantIds = [
    ...new Set(
      itemRows
        .filter((i) => !i.isBundle && i.partnerVariantId)
        .map((i) => i.partnerVariantId!),
    ),
  ]
  const bundleItemIds = itemRows.filter((i) => i.isBundle).map((i) => i.id)
  const componentRows = bundleItemIds.length
    ? await db
        .select()
        .from(itemComponents)
        .where(inArray(itemComponents.itemId, bundleItemIds))
    : []
  for (const c of componentRows) {
    if (c.partnerVariantId) variantIds.push(c.partnerVariantId)
  }
  const uniqueVariantIds = [...new Set(variantIds)]

  const variantMeta = new Map<
    string,
    {
      productName: string
      size: string | null
      variation: string | null
      price: number
    }
  >()
  if (uniqueVariantIds.length) {
    const variants = await db
      .select({
        id: partnerVariants.id,
        price: partnerVariants.price,
        productName: partnerProducts.name,
      })
      .from(partnerVariants)
      .innerJoin(
        partnerProducts,
        eq(partnerProducts.id, partnerVariants.partnerProductId),
      )
      .where(inArray(partnerVariants.id, uniqueVariantIds))
    const links = await db
      .select({
        variantId: partnerVariantValues.variantId,
        name: partnerOptionValues.name,
        type: partnerOptionGroups.type,
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
      .where(inArray(partnerVariantValues.variantId, uniqueVariantIds))
    for (const v of variants) {
      const mine = links.filter((l) => l.variantId === v.id)
      variantMeta.set(v.id, {
        productName: v.productName,
        size: mine.find((l) => l.type === 'ukuran')?.name ?? null,
        variation: mine.find((l) => l.type === 'variasi')?.name ?? null,
        price: Number(v.price),
      })
    }
  }

  const rows: Array<JastiperDetailRow> = []
  let satuanPcs = 0
  let paketPcs = 0
  const paketCountByRule = new Map<string, number>()

  for (const item of itemRows) {
    if (item.isBundle) {
      const ruleId = item.partnerRuleId
      if (ruleId)
        paketCountByRule.set(
          ruleId,
          (paketCountByRule.get(ruleId) ?? 0) + item.qty,
        )
      for (const c of componentRows.filter((c) => c.itemId === item.id)) {
        const meta = c.partnerVariantId
          ? variantMeta.get(c.partnerVariantId)
          : undefined
        const pcs = item.qty * c.qty
        paketPcs += pcs
        rows.push({
          variantId: c.partnerVariantId,
          productName: meta?.productName ?? c.productName,
          size: meta?.size ?? c.size,
          variation: meta?.variation ?? c.variation,
          ruleId,
          ruleName: ruleId ? (ruleNameById.get(ruleId) ?? null) : null,
          qty: pcs,
          unitPrice: meta?.price ?? 0,
        })
      }
    } else if (
      item.partnerVariantId &&
      variantMeta.has(item.partnerVariantId)
    ) {
      const meta = variantMeta.get(item.partnerVariantId)!
      satuanPcs += item.qty
      rows.push({
        variantId: item.partnerVariantId,
        productName: meta.productName,
        size: meta.size,
        variation: meta.variation,
        ruleId: null,
        ruleName: null,
        qty: item.qty,
        unitPrice: meta.price,
      })
    }
  }

  return {
    brandId: brand.id,
    brandName: brand.name ?? 'Jastiper',
    waNumber: brand.waNumber ?? null,
    orderCount: orderRows.length,
    totalPcs: satuanPcs + paketPcs,
    satuanPcs,
    paketPcs,
    paketCount: [...paketCountByRule.values()].reduce((s, n) => s + n, 0),
    totalAmount: rows.reduce((s, r) => s + r.qty * r.unitPrice, 0),
    rows,
  }
}

/** Jastiper yang ikut satu event partner, beserta event belanjanya. */
async function listEventJastiper(calendarEventId: string) {
  const { db } = await import('../db')
  const schema = await import('../db/schema')
  const { brands, events } = schema
  const jastiperEvents = await db
    .select({ id: events.id, brandId: events.brandId })
    .from(events)
    .where(eq(events.calendarEventId, calendarEventId))
  if (jastiperEvents.length === 0) return []
  const brandRows = await db
    .select({ id: brands.id, name: brands.name, waNumber: brands.waNumber })
    .from(brands)
    .where(
      inArray(brands.id, [...new Set(jastiperEvents.map((e) => e.brandId))]),
    )
  const brandById = new Map(brandRows.map((b) => [b.id, b]))
  return jastiperEvents.flatMap((e) => {
    const brand = brandById.get(e.brandId)
    return brand ? [{ eventId: e.id, brand }] : []
  })
}

/**
 * Detail satu jastiper di event partner: ringkasan dan barang per produk.
 */
export const getPartnerJastiperDetail = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      calendarEventId: idSchema,
      brandId: idSchema,
    }),
  )
  .handler(async ({ data }) => {
    const partner = await requirePartner()
    if (!(await partnerOwnsEvent(partner.id, data.calendarEventId))) {
      throw new Error('Event tidak ditemukan')
    }
    const { db } = await import('../db')
    const { brands, events } = await import('../db/schema')
    const [jastiperEvent] = await db
      .select({ id: events.id })
      .from(events)
      .where(
        and(
          eq(events.calendarEventId, data.calendarEventId),
          eq(events.brandId, data.brandId),
        ),
      )
    if (!jastiperEvent) throw new Error('Jastiper tidak ikut event ini')
    const [brand] = await db
      .select({ id: brands.id, name: brands.name, waNumber: brands.waNumber })
      .from(brands)
      .where(eq(brands.id, data.brandId))
    if (!brand) throw new Error('Jastiper tidak ditemukan')
    const detail = await loadJastiperEventDetail(
      partner.id,
      jastiperEvent.id,
      brand,
    )
    return detail
  })

/**
 * Ringkasan total seluruh jastiper di satu event partner: total belanjaan
 * (harga partner × pcs) per jastiper dan totalnya.
 */
export const getPartnerEventRevenue = createServerFn({ method: 'GET' })
  .validator(z.object({ calendarEventId: idSchema }))
  .handler(async ({ data }) => {
    const partner = await requirePartner()
    if (!(await partnerOwnsEvent(partner.id, data.calendarEventId))) {
      throw new Error('Event tidak ditemukan')
    }
    const jastiper = await listEventJastiper(data.calendarEventId)
    const perBrand = await Promise.all(
      jastiper.map(async ({ eventId, brand }) => {
        const d = await loadJastiperEventDetail(partner.id, eventId, brand)
        return {
          brandId: d.brandId,
          brandName: d.brandName,
          totalPcs: d.totalPcs,
          totalAmount: d.totalAmount,
        }
      }),
    )
    return {
      totalAmount: perBrand.reduce((s, b) => s + b.totalAmount, 0),
      totalPcs: perBrand.reduce((s, b) => s + b.totalPcs, 0),
      perBrand,
    }
  })

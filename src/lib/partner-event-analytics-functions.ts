import { createServerFn } from '@tanstack/react-start'
import { and, eq, inArray, ne } from 'drizzle-orm'
import { z } from 'zod'
import { buildMinPurchaseStats } from './min-purchase'
import type { MinPurchaseStats } from './min-purchase'
import { requirePartner } from './partner-auth'
import { buildEventAnalytics } from './partner-event-analytics'
import type { AnalyticsLine } from './partner-event-analytics'

/**
 * Analisa satu event partner: jastiper, pcs terjual, produk terlaris, stok
 * habis, dan peringkat jastiper. Nominal hanya dari tagihan (snapshot).
 * Jumlah pembeli/customer jastiper sengaja TIDAK dibuka ke partner.
 */
export const getPartnerEventAnalytics = createServerFn({ method: 'GET' })
  .validator(z.object({ calendarEventId: z.uuid() }))
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
      eventSubmissions,
      invoices,
      partnerEventProducts,
      partnerProducts,
      partnerVariants,
      partnerVariantValues,
      partnerOptionValues,
      partnerOptionGroups,
    } = schema

    const owned = await db
      .select({ id: calendarEvents.id })
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.id, data.calendarEventId),
          eq(calendarEvents.partnerId, partner.id),
        ),
      )
    if (owned.length === 0) throw new Error('Event tidak ditemukan')

    const { listSlotQueue } = await import('./event-slot-queries')
    const queue = await db.transaction((tx) =>
      listSlotQueue(tx, data.calendarEventId, new Date()),
    )
    const slotEnabled = queue.some((q) => q.status !== null)

    const jastiperEvents = await db
      .select({ id: events.id, brandId: events.brandId, brandName: brands.name })
      .from(events)
      .innerJoin(brands, eq(brands.id, events.brandId))
      .where(eq(events.calendarEventId, data.calendarEventId))
    const eventIds = jastiperEvents.map((e) => e.id)

    const orderRows = eventIds.length
      ? await db
          .select({ id: orders.id, eventId: orders.eventId })
          .from(orders)
          .where(inArray(orders.eventId, eventIds))
      : []
    const orderIds = orderRows.map((o) => o.id)

    // Hanya barang dari katalog partner (satuan bervarian atau paket).
    const itemRows = orderIds.length
      ? await db
          .select({
            id: items.id,
            orderId: items.orderId,
            qty: items.qty,
            isBundle: items.isBundle,
            partnerVariantId: items.partnerVariantId,
            submissionId: items.submissionId,
            submitStatus: items.submitStatus,
          })
          .from(items)
          .where(inArray(items.orderId, orderIds))
      : []
    const bundleIds = itemRows.filter((i) => i.isBundle).map((i) => i.id)
    const componentRows = bundleIds.length
      ? await db
          .select({
            itemId: itemComponents.itemId,
            partnerVariantId: itemComponents.partnerVariantId,
            productName: itemComponents.productName,
            size: itemComponents.size,
            variation: itemComponents.variation,
            qty: itemComponents.qty,
            submissionId: itemComponents.submissionId,
            submitStatus: itemComponents.submitStatus,
          })
          .from(itemComponents)
          .where(inArray(itemComponents.itemId, bundleIds))
      : []

    // Varian stok event: semua varian aktif dari produk yang dibawa ke event.
    const stockVariantRows = await db
      .select({
        variantId: partnerVariants.id,
        productName: partnerProducts.name,
        stockQty: partnerVariants.stockQty,
      })
      .from(partnerEventProducts)
      .innerJoin(partnerProducts, eq(partnerProducts.id, partnerEventProducts.productId))
      .innerJoin(partnerVariants, eq(partnerVariants.partnerProductId, partnerProducts.id))
      .where(
        and(
          eq(partnerEventProducts.calendarEventId, data.calendarEventId),
          eq(partnerProducts.partnerId, partner.id),
          eq(partnerVariants.isActive, true),
        ),
      )

    // Nama produk + ukuran/variasi untuk barang satuan dan varian stok.
    const variantIds = [
      ...new Set([
        ...itemRows
          .filter((i) => !i.isBundle && i.partnerVariantId)
          .map((i) => i.partnerVariantId!),
        ...stockVariantRows.map((v) => v.variantId),
      ]),
    ]
    const variantMeta = new Map<
      string,
      { productName: string; size: string | null; variation: string | null }
    >()
    if (variantIds.length) {
      const variants = await db
        .select({ id: partnerVariants.id, productName: partnerProducts.name })
        .from(partnerVariants)
        .innerJoin(partnerProducts, eq(partnerProducts.id, partnerVariants.partnerProductId))
        .where(inArray(partnerVariants.id, variantIds))
      const links = await db
        .select({
          variantId: partnerVariantValues.variantId,
          name: partnerOptionValues.name,
          type: partnerOptionGroups.type,
        })
        .from(partnerVariantValues)
        .innerJoin(partnerOptionValues, eq(partnerOptionValues.id, partnerVariantValues.optionValueId))
        .innerJoin(partnerOptionGroups, eq(partnerOptionGroups.id, partnerOptionValues.optionGroupId))
        .where(inArray(partnerVariantValues.variantId, variantIds))
      const linksByVariant = new Map<string, typeof links>()
      for (const l of links) {
        const list = linksByVariant.get(l.variantId) ?? []
        list.push(l)
        linksByVariant.set(l.variantId, list)
      }
      for (const v of variants) {
        const mine = linksByVariant.get(v.id) ?? []
        variantMeta.set(v.id, {
          productName: v.productName,
          size: mine.find((l) => l.type === 'ukuran')?.name ?? null,
          variation: mine.find((l) => l.type === 'variasi')?.name ?? null,
        })
      }
    }

    const lines: Array<AnalyticsLine> = []
    const itemById = new Map(itemRows.map((i) => [i.id, i]))
    for (const c of componentRows) {
      const item = itemById.get(c.itemId)
      if (!item) continue
      lines.push({
        orderId: item.orderId,
        submissionId: c.submissionId,
        variantId: c.partnerVariantId,
        productName: c.productName,
        size: c.size,
        variation: c.variation,
        kind: 'paket',
        qty: item.qty * c.qty,
        status: c.submitStatus,
      })
    }
    for (const item of itemRows) {
      if (item.isBundle || !item.partnerVariantId) continue
      const meta = variantMeta.get(item.partnerVariantId)
      if (!meta) continue
      lines.push({
        orderId: item.orderId,
        submissionId: item.submissionId,
        variantId: item.partnerVariantId,
        ...meta,
        kind: 'satuan',
        qty: item.qty,
        status: item.submitStatus,
      })
    }

    const submissionRows = eventIds.length
      ? await db
          .select({
            id: eventSubmissions.id,
            eventId: eventSubmissions.eventId,
            submittedAt: eventSubmissions.submittedAt,
          })
          .from(eventSubmissions)
          .where(inArray(eventSubmissions.eventId, eventIds))
      : []

    const invoiceRows = await db
      .select({
        brandId: invoices.brandId,
        status: invoices.status,
        amount: invoices.totalAmount,
        pcs: invoices.totalPcs,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.calendarEventId, data.calendarEventId),
          eq(invoices.partnerId, partner.id),
          ne(invoices.status, 'dibatalkan'),
        ),
      )

    // Minimal pembelian: angka agregat saja, partner tidak melihat draft per
    // jastiper. Hanya untuk event beralur slot.
    let minOrder: MinPurchaseStats | null = null
    if (slotEnabled) {
      const { loadDraftTotals } = await import('./min-purchase-queries')
      const [config] = await db
        .select({ minPurchase: calendarEvents.minPurchaseAmount })
        .from(calendarEvents)
        .where(eq(calendarEvents.id, data.calendarEventId))
      const drafts = await db.transaction((tx) =>
        loadDraftTotals(tx, partner.id, eventIds),
      )
      const firstSubmits = eventIds.length
        ? await db
            .select({
              eventId: eventSubmissions.eventId,
              total: eventSubmissions.submittedTotal,
            })
            .from(eventSubmissions)
            .where(
              and(
                inArray(eventSubmissions.eventId, eventIds),
                eq(eventSubmissions.submitNo, 1),
              ),
            )
        : []
      const firstByEvent = new Map(firstSubmits.map((s) => [s.eventId, s.total]))
      minOrder = buildMinPurchaseStats({
        minPurchase: config.minPurchase ? Number(config.minPurchase) : null,
        jastiper: eventIds.map((id) => {
          const total = firstByEvent.get(id)
          return {
            submitted: firstByEvent.has(id),
            firstSubmitTotal: total ? Number(total) : null,
            draftTotal: drafts.get(id)?.total ?? 0,
          }
        }),
      })
    }

    const analytics = buildEventAnalytics({
      slotEnabled,
      jastiper: jastiperEvents.map((e) => ({
        eventId: e.id,
        brandId: e.brandId,
        brandName: e.brandName ?? 'Jastiper',
      })),
      orders: orderRows,
      lines,
      submissions: submissionRows,
      invoices: invoiceRows.flatMap((r) =>
        r.status === 'dibatalkan'
          ? []
          : [{ brandId: r.brandId, status: r.status, amount: Number(r.amount), pcs: r.pcs }],
      ),
      stockVariants: stockVariantRows.map((v) => ({
        variantId: v.variantId,
        stockQty: v.stockQty,
        ...(variantMeta.get(v.variantId) ?? {
          productName: v.productName,
          size: null,
          variation: null,
        }),
      })),
    })
    return { ...analytics, minOrder }
  })

import { and, asc, eq, gt, inArray, isNull, ne, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { db } from '../db'
import {
  calendarEvents,
  invoiceSubmissions,
  invoices,
  itemComponents,
  items,
  partnerProducts,
  partnerVariants,
} from '../db/schema'
import { partnerProductPhotoUrl } from './partner-product-rules'
import {
  COMPARISON_LABELS,
  allocateProductRevenue,
  buildEventRows,
  dailyAmounts,
  inRange,
  previousRange,
  resolveRange,
  summarize,
} from './partner-analytics-rules'
import type {
  AnalyticsPreset,
  AnalyticsProductRow,
  DateRange,
  EventPerformanceRow,
  InvoiceFact,
  ProductLine,
  SalesSummary,
} from './partner-analytics-rules'
import { todayIsoDateInAppTimeZone } from './timezone'

/**
 * Data halaman Analytics Partner. Server-only, dibatasi `partnerId` dari sesi.
 * Definisi angka ada di `partner-analytics-rules.ts`; di sini hanya
 * pengambilan data.
 */

export type PartnerAnalytics = {
  preset: AnalyticsPreset
  range: DateRange
  previousRange: DateRange
  comparisonLabel: string
  /** Event yang dipilih di filter; null = semua event. */
  calendarEventId: string | null
  current: SalesSummary
  previous: SalesSummary
  /** Nilai tagihan per tanggal (WIB); grafik dibentuk di client. */
  currentDaily: Array<{ date: string; amount: number }>
  previousDaily: Array<{ date: string; amount: number }>
  events: Array<EventPerformanceRow>
  products: Array<AnalyticsProductRow>
  /** Semua event partner untuk pilihan filter, terbaru dulu. */
  eventOptions: Array<{ id: string; name: string; eventDate: string }>
}

const WIB = sql.raw(`'Asia/Jakarta'`)

/** `sent_at` di dalam rentang tanggal WIB (inklusif), tetap bisa pakai index. */
function sentWithin(range: DateRange): SQL {
  return sql`${invoices.sentAt} >= (${range.from}::date)::timestamp at time zone ${WIB}
    and ${invoices.sentAt} < ((${range.to}::date + 1)::timestamp) at time zone ${WIB}`
}

export async function getPartnerAnalytics(
  partnerId: string,
  input: {
    preset: AnalyticsPreset
    from?: string
    to?: string
    calendarEventId?: string
  },
): Promise<PartnerAnalytics> {
  const today = todayIsoDateInAppTimeZone()
  const { preset, range } = resolveRange(input.preset, today, input)
  const prev = previousRange(preset, range)
  const eventId = input.calendarEventId ?? null

  const activeInvoice = (window: DateRange) =>
    and(
      eq(invoices.partnerId, partnerId),
      ne(invoices.status, 'dibatalkan'),
      sentWithin(window),
      eventId ? eq(invoices.calendarEventId, eventId) : undefined,
    )
  // Periode pembanding bisa tidak bersambung dengan rentang ini (mis. 1–25
  // Okt vs 1–25 Nov), jadi ambil satu jendela lalu pilah di bawah.
  const fetchWindow: DateRange = {
    from: prev.from < range.from ? prev.from : range.from,
    to: range.to,
  }

  const [invoiceRows, eventRows, subRows, satuanRows, componentRows] =
    await Promise.all([
      db
        .select({
          calendarEventId: invoices.calendarEventId,
          date: sql<string>`to_char(${invoices.sentAt} at time zone ${WIB}, 'YYYY-MM-DD')`,
          amount: invoices.totalAmount,
          pcs: invoices.totalPcs,
        })
        .from(invoices)
        .where(activeInvoice(fetchWindow)),
      db
        .select({
          id: calendarEvents.id,
          name: calendarEvents.name,
          eventDate: calendarEvents.eventDate,
          endDate: calendarEvents.endDate,
          endedAt: calendarEvents.endedAt,
        })
        .from(calendarEvents)
        .where(eq(calendarEvents.partnerId, partnerId))
        .orderBy(sql`${calendarEvents.eventDate} desc`),
      // Nilai tiap submit di tagihan aktif periode ini (snapshot).
      db
        .select({
          submissionId: invoiceSubmissions.submissionId,
          amount: invoiceSubmissions.amount,
        })
        .from(invoiceSubmissions)
        .innerJoin(invoices, eq(invoices.id, invoiceSubmissions.invoiceId))
        .where(
          and(isNull(invoiceSubmissions.releasedAt), activeInvoice(range)),
        ),
      // Barang satuan yang disetujui di submit tsb.
      db
        .select({
          submissionId: invoiceSubmissions.submissionId,
          productId: partnerProducts.id,
          qty: items.qty,
          unitPrice: partnerVariants.price,
        })
        .from(items)
        .innerJoin(
          invoiceSubmissions,
          and(
            eq(invoiceSubmissions.submissionId, items.submissionId),
            isNull(invoiceSubmissions.releasedAt),
          ),
        )
        .innerJoin(invoices, eq(invoices.id, invoiceSubmissions.invoiceId))
        .innerJoin(
          partnerVariants,
          eq(partnerVariants.id, items.partnerVariantId),
        )
        .innerJoin(
          partnerProducts,
          eq(partnerProducts.id, partnerVariants.partnerProductId),
        )
        .where(
          and(
            eq(items.isBundle, false),
            eq(items.submitStatus, 'disetujui'),
            gt(items.qty, 0),
            activeInvoice(range),
          ),
        ),
      // Isi paket yang disetujui di submit tsb (pcs = jumlah paket × qty isi).
      db
        .select({
          submissionId: invoiceSubmissions.submissionId,
          productId: partnerProducts.id,
          productName: itemComponents.productName,
          qty: sql<number>`(${items.qty} * ${itemComponents.qty})::int`,
          unitPrice: partnerVariants.price,
        })
        .from(itemComponents)
        .innerJoin(items, eq(items.id, itemComponents.itemId))
        .innerJoin(
          invoiceSubmissions,
          and(
            eq(invoiceSubmissions.submissionId, itemComponents.submissionId),
            isNull(invoiceSubmissions.releasedAt),
          ),
        )
        .innerJoin(invoices, eq(invoices.id, invoiceSubmissions.invoiceId))
        .leftJoin(
          partnerVariants,
          eq(partnerVariants.id, itemComponents.partnerVariantId),
        )
        .leftJoin(
          partnerProducts,
          eq(partnerProducts.id, partnerVariants.partnerProductId),
        )
        .where(
          and(
            eq(itemComponents.submitStatus, 'disetujui'),
            activeInvoice(range),
          ),
        ),
    ])

  const facts: Array<InvoiceFact> = invoiceRows.map((r) => ({
    calendarEventId: r.calendarEventId,
    date: r.date,
    amount: Number(r.amount),
    pcs: r.pcs,
  }))
  const currentFacts = facts.filter((f) => inRange(f.date, range))
  const previousFacts = facts.filter((f) => inRange(f.date, prev))

  // Produk: baris tanpa varian katalog (data lama) dikelompokkan per nama.
  const lines: Array<ProductLine> = []
  const fallbackNames = new Map<string, string>()
  for (const r of satuanRows) {
    lines.push({
      submissionId: r.submissionId,
      productKey: r.productId,
      qty: r.qty,
      unitPrice: Number(r.unitPrice),
    })
  }
  for (const r of componentRows) {
    const key = r.productId ?? `name:${r.productName}`
    if (!r.productId) fallbackNames.set(key, r.productName)
    lines.push({
      submissionId: r.submissionId,
      productKey: key,
      qty: r.qty,
      unitPrice: Number(r.unitPrice ?? 0),
    })
  }
  const allocated = allocateProductRevenue(
    subRows.map((s) => ({
      submissionId: s.submissionId,
      amount: Number(s.amount),
    })),
    lines,
  )
  const productIds = [...allocated.keys()].filter((k) => !k.startsWith('name:'))
  const productMeta = productIds.length
    ? await db
        .select({
          id: partnerProducts.id,
          name: partnerProducts.name,
          code: partnerProducts.code,
          photoUpdatedAt: partnerProducts.photoUpdatedAt,
        })
        .from(partnerProducts)
        .where(
          and(
            eq(partnerProducts.partnerId, partnerId),
            inArray(partnerProducts.id, productIds),
          ),
        )
        .orderBy(asc(partnerProducts.name))
    : []
  const metaById = new Map(productMeta.map((p) => [p.id, p]))

  const products: Array<AnalyticsProductRow> = [...allocated.entries()].flatMap(
    ([key, v]) => {
      const meta = metaById.get(key)
      const name = meta?.name ?? fallbackNames.get(key)
      if (!name) return []
      return [
        {
          key,
          name,
          sku: meta?.code?.trim() || null,
          photoUrl: meta
            ? partnerProductPhotoUrl(meta.id, meta.photoUpdatedAt)
            : null,
          units: v.units,
          revenue: v.revenue,
        },
      ]
    },
  )

  const events = eventRows.map((e) => ({
    id: e.id,
    name: e.name,
    eventDate: e.eventDate,
    endDate: e.endDate,
    isEnded: e.endedAt !== null,
  }))

  return {
    preset,
    range,
    previousRange: prev,
    comparisonLabel: COMPARISON_LABELS[preset],
    calendarEventId: eventId,
    current: summarize(currentFacts),
    previous: summarize(previousFacts),
    currentDaily: dailyAmounts(currentFacts),
    previousDaily: dailyAmounts(previousFacts),
    events: buildEventRows({
      events: eventId ? events.filter((e) => e.id === eventId) : events,
      current: currentFacts,
      previous: previousFacts,
      range,
      today,
    }),
    products,
    eventOptions: eventRows.map((e) => ({
      id: e.id,
      name: e.name,
      eventDate: e.eventDate,
    })),
  }
}

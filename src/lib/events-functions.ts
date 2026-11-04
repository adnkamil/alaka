import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db'
import {
  events,
  items,
  orders,
  partnerPricingRules,
  partnerRuleProducts,
  partnerSubscriptions,
  partnerVariants,
} from '../db/schema'
import { inArray } from 'drizzle-orm'
import { hasPartnerPro } from './partner-entitlement'
import { computePendingRules, type PendingSingle } from './partner-paket-pending'
import { brandIdOf } from './brand'
import { getSessionUser } from './auth'

async function requireUser() {
  const user = await getSessionUser()
  if (!user) throw new Error('Belum login')
  return user
}

export const listEvents = createServerFn({ method: 'GET' }).handler(
  async () => {
    const user = await requireUser()

    // Total tagihan per pesanan — dipakai buat hitung sisa tagihan (DP).
    const orderTotals = db
      .select({
        orderId: items.orderId,
        total:
          sql<string>`coalesce(sum((${items.originalPrice} + ${items.fee}) * ${items.qty}), 0)`.as(
            'total',
          ),
      })
      .from(items)
      .groupBy(items.orderId)
      .as('order_totals')

    const rows = await db
      .select({
        id: events.id,
        name: events.name,
        eventDate: events.eventDate,
        isActive: events.isActive,
        orderCount: sql<number>`count(distinct ${orders.id})`.mapWith(Number),
        // Uang masuk = nominal yang sudah dibayar (DP ikut kehitung).
        amountIn: sql<string>`coalesce(sum(${orders.paidAmount}), 0)`,
        // Belum bayar = sisa tagihan tiap pesanan (total - yang sudah dibayar).
        outstanding: sql<string>`coalesce(sum(greatest(${orderTotals.total} - ${orders.paidAmount}, 0)), 0)`,
      })
      .from(events)
      .leftJoin(orders, eq(orders.eventId, events.id))
      .leftJoin(orderTotals, eq(orderTotals.orderId, orders.id))
      .where(eq(events.brandId, brandIdOf(user)))
      .groupBy(events.id)
      .orderBy(desc(events.eventDate))

    return rows
  },
)

const eventInputSchema = z.object({
  name: z.string().min(1, 'Nama event wajib diisi'),
  description: z.string().optional(),
  eventDate: z.string(), // ISO date string
  feeRuleId: z.uuid().nullable().optional(),
})

export const createEvent = createServerFn({ method: 'POST' })
  .validator(eventInputSchema)
  .handler(async ({ data }) => {
    const user = await requireUser()
    const [event] = await db
      .insert(events)
      .values({
        userId: user.id,
        brandId: user.brandId,
        name: data.name,
        description: data.description || null,
        eventDate: new Date(data.eventDate),
        feeRuleId: data.feeRuleId ?? null,
      })
      .returning()
    return event
  })

export const updateEvent = createServerFn({ method: 'POST' })
  .validator(eventInputSchema.extend({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const user = await requireUser()
    await db
      .update(events)
      .set({
        name: data.name,
        description: data.description || null,
        eventDate: new Date(data.eventDate),
        feeRuleId: data.feeRuleId ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(events.id, data.id), eq(events.brandId, brandIdOf(user))))
  })

export const deleteEvent = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const user = await requireUser()
    await db
      .delete(events)
      .where(and(eq(events.id, data.id), eq(events.brandId, brandIdOf(user))))
  })

/**
 * Aktifkan / nonaktifkan event. Nonaktif bukan hapus: cuma menandai event sudah
 * selesai/ditutup, jadi ia keluar dari daftar "Event aktif" di beranda dan
 * pesanan baru ditolak (`createOrder`), sementara data pesanan/tagihan lamanya
 * tetap utuh dan bisa dibuka lagi kapan pun.
 */
export const setEventActive = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.uuid(), isActive: z.boolean() }))
  .handler(async ({ data }) => {
    const user = await requireUser()
    const updated = await db
      .update(events)
      .set({ isActive: data.isActive, updatedAt: new Date() })
      .where(and(eq(events.id, data.id), eq(events.brandId, brandIdOf(user))))
      .returning({ id: events.id })

    if (updated.length === 0) throw new Error('Event tidak ditemukan')
  })

/**
 * Aktifkan / matikan "sembunyikan rincian fee" untuk event ini. Kalau aktif,
 * invoice/tagihan ke pelanggan tidak memecah harga jadi "harga + fee" —
 * daftar barang cukup menampilkan qty + harga nett per unit. Total tagihan
 * tetap sama. Diatur dari menu ⋮ di halaman Detail Event.
 */
export const setEventHideFee = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.uuid(), hideFee: z.boolean() }))
  .handler(async ({ data }) => {
    const user = await requireUser()
    const updated = await db
      .update(events)
      .set({ hideFee: data.hideFee, updatedAt: new Date() })
      .where(and(eq(events.id, data.id), eq(events.brandId, brandIdOf(user))))
      .returning({ id: events.id })

    if (updated.length === 0) throw new Error('Event tidak ditemukan')
  })

export const getEventDetail = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const user = await requireUser()

    const event = await db.query.events.findFirst({
      where: and(eq(events.id, data.id), eq(events.brandId, brandIdOf(user))),
      with: {
        feeRule: { with: { tiers: true } },
        orders: { with: { items: { with: { components: true } } } },
      },
    })

    if (!event) throw new Error('Event tidak ditemukan')

    // Catatan "N pcs lagi untuk paket" per pesanan. Hanya untuk aturan dari partner PRO,
    // karena paket di luar itu tidak pernah terbentuk.
    const singleVariantIds = event.orders.flatMap((o) =>
      o.items
        .filter((i) => !i.isBundle && i.partnerVariantId)
        .map((i) => i.partnerVariantId as string),
    )
    if (singleVariantIds.length === 0) {
      return {
        ...event,
        orders: event.orders.map((o) => ({
          ...o,
          pendingRules: [],
          items: o.items.map((i) => ({ ...i, groupLabel: null as string | null })),
        })),
      }
    }

    const variantRows = await db
      .select({ id: partnerVariants.id, productId: partnerVariants.partnerProductId })
      .from(partnerVariants)
      .where(inArray(partnerVariants.id, [...new Set(singleVariantIds)]))
    const productByVariant = new Map(variantRows.map((v) => [v.id, v.productId]))

    const ruleProductRows = await db
      .select({ ruleId: partnerRuleProducts.ruleId, productId: partnerRuleProducts.partnerProductId })
      .from(partnerRuleProducts)
      .where(inArray(partnerRuleProducts.partnerProductId, [...new Set(productByVariant.values())]))
    const ruleByProduct = new Map(ruleProductRows.map((r) => [r.productId, r.ruleId]))

    const ruleRows = await db
      .select({
        id: partnerPricingRules.id,
        name: partnerPricingRules.name,
        minQty: partnerPricingRules.minQty,
        partnerId: partnerPricingRules.partnerId,
        isActive: partnerPricingRules.isActive,
      })
      .from(partnerPricingRules)
      .where(inArray(partnerPricingRules.id, [...new Set(ruleByProduct.values())]))
    const ruleById = new Map(ruleRows.map((r) => [r.id, r]))

    const partnerIds = [...new Set(ruleRows.map((r) => r.partnerId))]
    const subRows = partnerIds.length
      ? await db
          .select({
            partnerId: partnerSubscriptions.partnerId,
            status: partnerSubscriptions.status,
            startedAt: partnerSubscriptions.startedAt,
            endsAt: partnerSubscriptions.endsAt,
          })
          .from(partnerSubscriptions)
          .where(inArray(partnerSubscriptions.partnerId, partnerIds))
      : []
    const proPartners = new Set(
      partnerIds.filter((pid) =>
        hasPartnerPro(subRows.filter((s) => s.partnerId === pid)),
      ),
    )

    return {
      ...event,
      orders: event.orders.map((order) => {
        const singles: Array<PendingSingle> = []
        // Nama aturan per barang satuan, untuk label kecil "masuk paket apa".
        const groupLabelByItem = new Map<string, string>()
        for (const item of order.items) {
          if (item.isBundle || !item.partnerVariantId) continue
          const productId = productByVariant.get(item.partnerVariantId)
          const ruleId = productId ? ruleByProduct.get(productId) : undefined
          const rule = ruleId ? ruleById.get(ruleId) : undefined
          if (!rule || !rule.isActive || !proPartners.has(rule.partnerId)) continue
          groupLabelByItem.set(item.id, rule.name)
          singles.push({
            itemId: item.id,
            qty: item.qty,
            addedAt: item.createdAt,
            ruleId: rule.id,
            ruleName: rule.name,
            minQty: rule.minQty,
          })
        }
        return {
          ...order,
          pendingRules: computePendingRules(singles),
          items: order.items.map((i) => ({
            ...i,
            groupLabel: groupLabelByItem.get(i.id) ?? null,
          })),
        }
      }),
    }
  })

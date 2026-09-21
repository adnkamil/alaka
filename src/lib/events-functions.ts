import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db'
import { events, items, orders } from '../db/schema'
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
        total: sql<string>`coalesce(sum((${items.originalPrice} + ${items.fee}) * ${items.qty}), 0)`.as(
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
        orderCount: sql<number>`count(distinct ${orders.id})`.mapWith(Number),
        // Uang masuk = nominal yang sudah dibayar (DP ikut kehitung).
        amountIn: sql<string>`coalesce(sum(${orders.paidAmount}), 0)`,
        // Belum bayar = sisa tagihan tiap pesanan (total - yang sudah dibayar).
        outstanding: sql<string>`coalesce(sum(greatest(${orderTotals.total} - ${orders.paidAmount}, 0)), 0)`,
      })
      .from(events)
      .leftJoin(orders, eq(orders.eventId, events.id))
      .leftJoin(orderTotals, eq(orderTotals.orderId, orders.id))
      .where(eq(events.userId, user.id))
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
      .where(and(eq(events.id, data.id), eq(events.userId, user.id)))
  })

export const deleteEvent = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const user = await requireUser()
    await db
      .delete(events)
      .where(and(eq(events.id, data.id), eq(events.userId, user.id)))
  })

export const getEventDetail = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const user = await requireUser()

    const event = await db.query.events.findFirst({
      where: and(eq(events.id, data.id), eq(events.userId, user.id)),
      with: {
        feeRule: { with: { tiers: true } },
        orders: { with: { items: true } },
      },
    })

    if (!event) throw new Error('Event tidak ditemukan')
    return event
  })

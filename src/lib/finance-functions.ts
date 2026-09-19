import { createServerFn } from '@tanstack/react-start'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../db'
import { events, items, orders } from '../db/schema'
import { getSessionUser } from './auth'

async function requireUser() {
  const user = await getSessionUser()
  if (!user) throw new Error('Belum login')
  return user
}

export const getFinanceSummary = createServerFn({ method: 'GET' }).handler(
  async () => {
    const user = await requireUser()

    const [totals] = await db
      .select({
        totalIn: sql<string>`coalesce(sum(case when ${orders.paymentStatus} in ('paid', 'shipped') then (${items.originalPrice} + ${items.fee}) * ${items.qty} else 0 end), 0)`,
        totalOut: sql<string>`coalesce(sum(case when ${orders.paymentStatus} in ('paid', 'shipped') then ${items.originalPrice} * ${items.qty} else 0 end), 0)`,
        netProfit: sql<string>`coalesce(sum(case when ${orders.paymentStatus} in ('paid', 'shipped') then ${items.fee} * ${items.qty} else 0 end), 0)`,
      })
      .from(events)
      .leftJoin(orders, eq(orders.eventId, events.id))
      .leftJoin(items, eq(items.orderId, orders.id))
      .where(eq(events.userId, user.id))

    // Monthly revenue chart counts orders that are paid or shipped.
    const monthly = await db
      .select({
        month: sql<string>`to_char(${orders.createdAt}, 'YYYY-MM')`,
        revenue: sql<string>`coalesce(sum((${items.originalPrice} + ${items.fee}) * ${items.qty}), 0)`,
      })
      .from(events)
      .innerJoin(orders, eq(orders.eventId, events.id))
      .innerJoin(items, eq(items.orderId, orders.id))
      .where(
        and(
          eq(events.userId, user.id),
          inArray(orders.paymentStatus, ['paid', 'shipped']),
        ),
      )
      .groupBy(sql`to_char(${orders.createdAt}, 'YYYY-MM')`)
      .orderBy(sql`to_char(${orders.createdAt}, 'YYYY-MM')`)

    const perEvent = await db
      .select({
        eventId: events.id,
        eventName: events.name,
        eventDate: events.eventDate,
        amountIn: sql<string>`coalesce(sum(case when ${orders.paymentStatus} in ('paid', 'shipped') then (${items.originalPrice} + ${items.fee}) * ${items.qty} else 0 end), 0)`,
        amountOut: sql<string>`coalesce(sum(case when ${orders.paymentStatus} in ('paid', 'shipped') then ${items.originalPrice} * ${items.qty} else 0 end), 0)`,
        profit: sql<string>`coalesce(sum(case when ${orders.paymentStatus} in ('paid', 'shipped') then ${items.fee} * ${items.qty} else 0 end), 0)`,
      })
      .from(events)
      .leftJoin(orders, eq(orders.eventId, events.id))
      .leftJoin(items, eq(items.orderId, orders.id))
      .where(eq(events.userId, user.id))
      .groupBy(events.id)

    return {
      totals,
      monthly,
      perEvent,
    }
  },
)
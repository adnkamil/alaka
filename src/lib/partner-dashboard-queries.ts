import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '../db'
import {
  brands,
  calendarEvents,
  events,
  orders,
  partnerProducts,
} from '../db/schema'

/**
 * Angka ringkasan untuk Beranda Partner Portal. Server-only, dibatasi
 * `partnerId` dari sesi. "Jastiper" = brand jastiper yang menekan "Ikut Event"
 * di event milik partner ini; "pesanan" = pesanan di event belanja hasil
 * "Ikut Event" tsb (bukan semua pesanan brand itu).
 */

export type PartnerDashboard = {
  activeProducts: number
  /** Brand jastiper berbeda yang ikut di semua event partner. */
  jastiperCount: number
  orderCount: number
  /** Jastiper yang paling baru ikut (maks 5). */
  recentJoins: Array<{
    brandName: string | null
    eventName: string
    joinedAt: Date
  }>
}

export async function getPartnerDashboard(
  partnerId: string,
): Promise<PartnerDashboard> {
  const [products, aggregate, recent] = await Promise.all([
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(partnerProducts)
      .where(
        and(
          eq(partnerProducts.partnerId, partnerId),
          eq(partnerProducts.isActive, true),
        ),
      ),
    db
      .select({
        jastipers: sql<number>`count(distinct ${events.brandId})::int`,
        orderCount: sql<number>`count(${orders.id})::int`,
      })
      .from(events)
      .innerJoin(calendarEvents, eq(events.calendarEventId, calendarEvents.id))
      .leftJoin(orders, eq(orders.eventId, events.id))
      .where(eq(calendarEvents.partnerId, partnerId)),
    db
      .select({
        brandName: brands.name,
        eventName: calendarEvents.name,
        joinedAt: events.createdAt,
      })
      .from(events)
      .innerJoin(calendarEvents, eq(events.calendarEventId, calendarEvents.id))
      .innerJoin(brands, eq(events.brandId, brands.id))
      .where(eq(calendarEvents.partnerId, partnerId))
      .orderBy(desc(events.createdAt))
      .limit(5),
  ])

  return {
    activeProducts: products[0].n,
    jastiperCount: aggregate[0].jastipers,
    orderCount: aggregate[0].orderCount,
    recentJoins: recent,
  }
}

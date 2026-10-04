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

/**
 * Bulan (`YYYY-MM`) untuk grafik omzet, dihitung dalam zona WIB.
 *
 * `orders.created_at` bertipe `timestamptz`, jadi `to_char` polos mengikuti
 * TimeZone sesi koneksi — di Neon itu UTC, jadi transaksi tanggal 1 pagi WIB
 * bisa nyasar ke bulan sebelumnya. Karena itu instant-nya dikonversi eksplisit
 * dulu ke `Asia/Jakarta`.
 *
 * Zona ditulis sebagai literal (bukan `${APP_TIME_ZONE}`/bind parameter): kalau
 * jadi `$n`, tiap kemunculan dapat nomor parameter berbeda dan Postgres
 * menganggap ekspresi di SELECT vs GROUP BY berbeda -> error "must appear in the
 * GROUP BY clause". Dijadikan satu konstanta supaya teks SELECT, GROUP BY, dan
 * ORDER BY-nya pasti identik. Lihat juga `src/lib/timezone.ts`.
 */
const monthInJakarta = sql<string>`to_char(${orders.createdAt} at time zone 'Asia/Jakarta', 'YYYY-MM')`

export const getFinanceSummary = createServerFn({ method: 'GET' }).handler(
  async () => {
    const user = await requireUser()

    // Kelima query di bawah saling independen (semuanya cuma butuh user.id),
    // jadi dijalankan paralel — bukan berurutan satu per satu.
    const totalsQuery = db
      .select({
        totalOut: sql<string>`coalesce(sum(case when ${orders.paymentStatus} in ('paid', 'shipped') then ${items.originalPrice} * ${items.qty} else 0 end), 0)`,
        netProfit: sql<string>`coalesce(sum(case when ${orders.paymentStatus} in ('paid', 'shipped') then ${items.fee} * ${items.qty} else 0 end), 0)`,
      })
      .from(events)
      .leftJoin(orders, eq(orders.eventId, events.id))
      .leftJoin(items, eq(items.orderId, orders.id))
      .where(eq(events.userId, user.id))

    // Uang masuk = nominal yang sudah dibayar (DP ikut kehitung). Dihitung
    // langsung dari `orders.paid_amount`, TANPA join items — kalau lewat join
    // items, nominal per pesanan bakal terkali jumlah barangnya.
    const paidTotalsQuery = db
      .select({ totalIn: sql<string>`coalesce(sum(${orders.paidAmount}), 0)` })
      .from(events)
      .innerJoin(orders, eq(orders.eventId, events.id))
      .where(eq(events.userId, user.id))

    // Monthly revenue chart counts orders that are paid or shipped.
    const monthlyQuery = db
      .select({
        month: monthInJakarta,
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
      .groupBy(monthInJakarta)
      .orderBy(monthInJakarta)

    // "Masuk" per event juga dari paid_amount (tanpa join items).
    const paidPerEventQuery = db
      .select({
        eventId: events.id,
        amountIn: sql<string>`coalesce(sum(${orders.paidAmount}), 0)`,
      })
      .from(events)
      .innerJoin(orders, eq(orders.eventId, events.id))
      .where(eq(events.userId, user.id))
      .groupBy(events.id)

    const perEventQuery = db
      .select({
        eventId: events.id,
        eventName: events.name,
        eventDate: events.eventDate,
        amountOut: sql<string>`coalesce(sum(case when ${orders.paymentStatus} in ('paid', 'shipped') then ${items.originalPrice} * ${items.qty} else 0 end), 0)`,
        profit: sql<string>`coalesce(sum(case when ${orders.paymentStatus} in ('paid', 'shipped') then ${items.fee} * ${items.qty} else 0 end), 0)`,
      })
      .from(events)
      .leftJoin(orders, eq(orders.eventId, events.id))
      .leftJoin(items, eq(items.orderId, orders.id))
      .where(eq(events.userId, user.id))
      .groupBy(events.id)

    const [[totals], [paidTotals], monthly, paidPerEventRows, perEvent] =
      await Promise.all([
        totalsQuery,
        paidTotalsQuery,
        monthlyQuery,
        paidPerEventQuery,
        perEventQuery,
      ])
    const paidPerEvent = new Map(
      paidPerEventRows.map((row) => [row.eventId, row.amountIn]),
    )

    return {
      totals: { ...totals, totalIn: paidTotals.totalIn },
      monthly,
      perEvent: perEvent.map((row) => ({
        ...row,
        amountIn: paidPerEvent.get(row.eventId) ?? '0',
      })),
    }
  },
)

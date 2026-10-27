import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq, isNull, lte, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db'
import { calendarEvents } from '../db/schema'
import { getSessionUser } from './auth'
import { MONTH_KEY_PATTERN, calendarBannerSrc, monthRange } from './calendar'
import { brandIdOf } from './brand'
import { getEventPartnerShowcase } from './partner-showcase-queries'
import { requireBrandPermission } from './brand-permissions'
import {
  findJoinedEventId,
  joinCalendarEventForBrand,
} from './calendar-join-queries'

/** Tanggal terakhir event: `end_date`, atau `event_date` untuk event sehari. */
const eventLastDate = sql<string>`coalesce(${calendarEvents.endDate}, ${calendarEvents.eventDate})`

async function requireUser() {
  const user = await getSessionUser()
  if (!user) throw new Error('Belum login')
  return user
}

/**
 * Daftar event kalender untuk satu bulan: event yang berlangsung di bulan itu,
 * termasuk yang mulai di bulan sebelumnya tapi belum selesai. Gratis untuk
 * semua user yang login (tidak ada cek PRO) dan global — tidak difilter per brand.
 */
export const listCalendarEvents = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      month: z.string().regex(MONTH_KEY_PATTERN, 'Format bulan harus YYYY-MM'),
    }),
  )
  .handler(async ({ data }) => {
    await requireUser()

    const { start, end } = monthRange(data.month)
    return db
      .select({
        id: calendarEvents.id,
        name: calendarEvents.name,
        location: calendarEvents.location,
        eventDate: calendarEvents.eventDate,
        endDate: calendarEvents.endDate,
        isOnline: calendarEvents.isOnline,
      })
      .from(calendarEvents)
      .where(
        and(
          lte(calendarEvents.eventDate, end),
          sql`${eventLastDate} >= ${start}`,
          isNull(calendarEvents.endedAt),
        ),
      )
      .orderBy(asc(calendarEvents.eventDate), asc(calendarEvents.name))
  })

/**
 * Daftar event yang akan datang dan sedang berlangsung (tanggal terakhirnya
 * >= `from`), diurutkan dari tanggal mulai terdekat. Event yang diakhiri admin
 * tidak ikut. Dipakai halaman Event; filter waktu/lokasi/pencarian dikerjakan
 * di client.
 */
export const listUpcomingCalendarEvents = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      from: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD'),
    }),
  )
  .handler(async ({ data }) => {
    await requireUser()

    return db
      .select({
        id: calendarEvents.id,
        name: calendarEvents.name,
        location: calendarEvents.location,
        eventDate: calendarEvents.eventDate,
        endDate: calendarEvents.endDate,
        isOnline: calendarEvents.isOnline,
      })
      .from(calendarEvents)
      .where(
        and(
          sql`${eventLastDate} >= ${data.from}`,
          isNull(calendarEvents.endedAt),
        ),
      )
      .orderBy(asc(calendarEvents.eventDate), asc(calendarEvents.name))
      .limit(300)
  })

/**
 * Detail satu event kalender (banner, deskripsi, lokasi, tanggal, brand).
 * `myEventId` = id event belanja milik brand user kalau brand-nya sudah ikut
 * event ini (tombol berubah jadi "Lihat Event Saya"), selain itu null.
 */
export const getCalendarEvent = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const user = await requireUser()

    const rows = await db
      .select({
        id: calendarEvents.id,
        name: calendarEvents.name,
        location: calendarEvents.location,
        eventDate: calendarEvents.eventDate,
        endDate: calendarEvents.endDate,
        isOnline: calendarEvents.isOnline,
        endedAt: calendarEvents.endedAt,
        description: calendarEvents.description,
        bannerUpdatedAt: calendarEvents.bannerUpdatedAt,
        exhibitors: calendarEvents.exhibitors,
      })
      .from(calendarEvents)
      .where(eq(calendarEvents.id, data.id))
    const event = rows.at(0)
    if (!event) throw new Error('Event tidak ditemukan')
    const { bannerUpdatedAt, endedAt, ...rest } = event
    const [myEventId, showcase] = await Promise.all([
      findJoinedEventId(brandIdOf(user), event.id),
      // Null untuk event buatan admin; untuk event partner: produk unggulan + katalog PDF.
      getEventPartnerShowcase(event.id),
    ])
    return {
      ...rest,
      myEventId,
      showcase,
      // Link event yang sudah diakhiri tetap bisa dibuka (mis. dari chat),
      // tapi halamannya menandai bahwa event sudah berakhir.
      isEnded: endedAt !== null,
      bannerSrc: calendarBannerSrc(event.id, bannerUpdatedAt),
    }
  })

/**
 * "Ikut Event": jastiper (brand) ikut event kalender, dan event belanja baru
 * otomatis dibuat di akun brand-nya. Perlu izin `operations` (pemilik maupun
 * admin brand) dan nomor WhatsApp brand yang sudah terisi. Idempoten — kalau
 * brand sudah ikut, event yang sudah ada dikembalikan.
 */
export const joinCalendarEvent = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      calendarEventId: z.uuid(),
      feeRuleId: z.uuid().nullable().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const user = await requireUser()
    requireBrandPermission(user, 'operations')

    const { eventId } = await joinCalendarEventForBrand({
      userId: user.id,
      brandId: brandIdOf(user),
      calendarEventId: data.calendarEventId,
      feeRuleId: data.feeRuleId ?? null,
    })
    return { eventId }
  })

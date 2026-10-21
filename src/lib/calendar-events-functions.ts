import { createServerFn } from '@tanstack/react-start'
import { asc, between, eq, gte } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db'
import { calendarEvents } from '../db/schema'
import { getSessionUser } from './auth'
import { MONTH_KEY_PATTERN, calendarBannerSrc, monthRange } from './calendar'

async function requireUser() {
  const user = await getSessionUser()
  if (!user) throw new Error('Belum login')
  return user
}

/**
 * Daftar event kalender untuk satu bulan. Gratis untuk semua user yang login
 * (tidak ada cek PRO) dan global — tidak difilter per brand.
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
      })
      .from(calendarEvents)
      .where(between(calendarEvents.eventDate, start, end))
      .orderBy(asc(calendarEvents.eventDate), asc(calendarEvents.name))
  })

/**
 * Daftar event yang akan datang (tanggal >= `from`), diurutkan dari yang paling
 * dekat. Dipakai halaman Event; filter waktu/lokasi/pencarian dikerjakan di client.
 */
export const listUpcomingCalendarEvents = createServerFn({ method: 'GET' })
  .validator(
    z.object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD'),
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
      })
      .from(calendarEvents)
      .where(gte(calendarEvents.eventDate, data.from))
      .orderBy(asc(calendarEvents.eventDate), asc(calendarEvents.name))
      .limit(300)
  })

/** Detail satu event kalender (banner, deskripsi, lokasi, tanggal, brand). */
export const getCalendarEvent = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    await requireUser()

    const rows = await db
      .select({
        id: calendarEvents.id,
        name: calendarEvents.name,
        location: calendarEvents.location,
        eventDate: calendarEvents.eventDate,
        description: calendarEvents.description,
        bannerUpdatedAt: calendarEvents.bannerUpdatedAt,
        exhibitors: calendarEvents.exhibitors,
      })
      .from(calendarEvents)
      .where(eq(calendarEvents.id, data.id))
    const event = rows.at(0)
    if (!event) throw new Error('Event tidak ditemukan')
    const { bannerUpdatedAt, ...rest } = event
    return { ...rest, bannerSrc: calendarBannerSrc(event.id, bannerUpdatedAt) }
  })

import { createServerFn } from '@tanstack/react-start'
import { asc, between, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db'
import { calendarEvents } from '../db/schema'
import { getSessionUser } from './auth'
import { MONTH_KEY_PATTERN, monthRange } from './calendar'

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
        bannerUrl: calendarEvents.bannerUrl,
        exhibitors: calendarEvents.exhibitors,
      })
      .from(calendarEvents)
      .where(eq(calendarEvents.id, data.id))
    const event = rows.at(0)
    if (!event) throw new Error('Event tidak ditemukan')
    return event
  })

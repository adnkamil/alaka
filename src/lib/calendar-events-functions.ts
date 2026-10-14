import { createServerFn } from '@tanstack/react-start'
import { asc, between } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db'
import { calendarEvents } from '../db/schema'
import { getSessionUser } from './auth'
import { MONTH_KEY_PATTERN, monthRange } from './calendar'

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
    const user = await getSessionUser()
    if (!user) throw new Error('Belum login')

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

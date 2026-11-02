import { createServerFn } from '@tanstack/react-start'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { events } from '../db/schema'
import { getSessionUser } from './auth'
import { brandIdOf } from './brand'
import { loadEventPartnerItemCatalog } from './partner-event-items'

const schema = z.object({ eventId: z.uuid() })

/**
 * Daftar produk dan varian untuk form tambah barang di event jastiper.
 * `isPartnerEvent` menentukan apakah nama barang harus dipilih dari katalog.
 */
export const getEventPartnerItems = createServerFn({ method: 'GET' })
  .validator(schema)
  .handler(async ({ data }) => {
    const { db } = await import('../db')
    const user = await getSessionUser()
    if (!user) throw new Error('Belum login')

    const event = await db.query.events.findFirst({
      where: and(eq(events.id, data.eventId), eq(events.brandId, brandIdOf(user))),
    })
    if (!event) throw new Error('Event tidak ditemukan')

    return loadEventPartnerItemCatalog(event.calendarEventId)
  })

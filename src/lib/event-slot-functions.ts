import { createServerFn } from '@tanstack/react-start'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getSessionUser } from './auth'
import { brandIdOf } from './brand'

/**
 * Server function alur slot sisi jastiper: submit pesanan ke partner, ringkasan
 * status/urutan, dan keputusan sanggah per paket. Query-nya ada di
 * `event-slot-queries.ts`. Isi handler memakai import dinamis supaya `db` tidak
 * ikut ke bundle client.
 */

async function requireUser() {
  const user = await getSessionUser()
  if (!user) throw new Error('Belum login')
  return user
}

const eventIdSchema = z.object({ eventId: z.uuid() })

/** Status alur slot satu event + urutan submit. Null = event tidak memakai alur slot. */
export const getEventSlotSummary = createServerFn({ method: 'GET' })
  .validator(eventIdSchema)
  .handler(async ({ data }) => {
    const { db } = await import('../db')
    const { events } = await import('../db/schema')
    const { getSlotSummary } = await import('./event-slot-queries')
    const user = await requireUser()
    return db.transaction(async (tx) => {
      const owned = await tx.query.events.findFirst({
        where: and(
          eq(events.id, data.eventId),
          eq(events.brandId, brandIdOf(user)),
        ),
      })
      if (!owned) throw new Error('Event tidak ditemukan')
      const now = new Date()
      const event = await tx.query.events.findFirst({
        where: eq(events.id, owned.id),
      })
      return getSlotSummary(tx, event ?? owned, now)
    })
  })


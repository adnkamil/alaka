import { createServerFn } from '@tanstack/react-start'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getSessionUser } from './auth'
import { brandIdOf } from './brand'
import { isSlotEnabled, slotPhase } from './event-slot'
import {
  computeDraftTotal,
  draftFingerprint,
  minPurchaseShortfall,
} from './min-purchase'

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

/**
 * Isi draft yang akan dikirim, sudah dipaketkan seperti dihitung partner,
 * beserta status minimal pembelian. Dipakai halaman "Cek pesanan". Null =
 * event tidak memakai alur slot.
 */
export const getSubmitPreview = createServerFn({ method: 'GET' })
  .validator(eventIdSchema)
  .handler(async ({ data }) => {
    const { db } = await import('../db')
    const { eventSubmissions, events, partners } = await import('../db/schema')
    const { loadSlotConfig } = await import('./event-slot-queries')
    const { loadDraftSources } = await import('./min-purchase-queries')
    const { loadActiveRules } = await import('./invoice-pooling-queries')
    const user = await requireUser()
    return db.transaction(async (tx) => {
      const event = await tx.query.events.findFirst({
        where: and(
          eq(events.id, data.eventId),
          eq(events.brandId, brandIdOf(user)),
        ),
      })
      if (!event) throw new Error('Event tidak ditemukan')
      const config = await loadSlotConfig(tx, event.calendarEventId)
      if (!isSlotEnabled(config) || !config?.partnerId) return null
      const sources =
        (await loadDraftSources(tx, { eventIds: [event.id] })).get(event.id) ??
        []
      const draft = computeDraftTotal(
        sources,
        await loadActiveRules(tx, config.partnerId),
      )
      const isFirstSubmit =
        (await tx.$count(
          eventSubmissions,
          eq(eventSubmissions.eventId, event.id),
        )) === 0
      const partner = await tx
        .select({ name: partners.name })
        .from(partners)
        .where(eq(partners.id, config.partnerId))
        .then((rows) => rows.at(0))
      return {
        ...draft,
        fingerprint: draftFingerprint(sources),
        isFirstSubmit,
        minPurchase: config.minPurchase,
        shortfall: minPurchaseShortfall({
          total: draft.total,
          minPurchase: config.minPurchase,
          isFirstSubmit,
        }),
        phase: slotPhase(config, new Date()),
        opensAt: config.opensAt as Date,
        closesAt: config.closesAt as Date,
        partnerName: partner?.name ?? 'Partner',
      }
    })
  })

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


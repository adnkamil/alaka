import { createServerFn } from '@tanstack/react-start'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getSessionUser } from './auth'
import { brandIdOf } from './brand'
import { isSlotEnabled, slotPhase } from './event-slot'
import { requirePartner } from './partner-auth'
import { partnerOwnsEvent } from './partner-event-queries'

/**
 * Server function alur submit bertahap. Handler memakai import dinamis supaya
 * `db` tidak ikut ke bundle client. Query ada di `submit-queries.ts`.
 */

const idSchema = z.uuid()

const decisionSchema = z.object({
  id: idSchema,
  approvedQty: z.number().int().min(0),
})

/** Jastiper menekan Submit. Hanya barang draft yang dikirim. */
export const submitOrdersBatch = createServerFn({ method: 'POST' })
  .validator(z.object({ eventId: idSchema }))
  .handler(async ({ data }) => {
    const { db } = await import('../db')
    const { events } = await import('../db/schema')
    const { loadSlotConfig } = await import('./event-slot-queries')
    const { submitEventOrders } = await import('./submit-queries')
    const user = await getSessionUser()
    if (!user) throw new Error('Belum login')

    return db.transaction(async (tx) => {
      const event = await tx
        .select()
        .from(events)
        .where(
          and(eq(events.id, data.eventId), eq(events.brandId, brandIdOf(user))),
        )
        .for('update')
        .then((rows) => rows.at(0))
      if (!event) throw new Error('Event tidak ditemukan')

      const now = new Date()
      const config = await loadSlotConfig(tx, event.calendarEventId)
      if (isSlotEnabled(config)) {
        const phase = slotPhase(config!, now)
        if (phase === 'belum_dibuka') {
          throw new Error('Slot pemesanan belum dibuka oleh partner.')
        }
        if (phase === 'ditutup') {
          throw new Error('Slot pemesanan sudah ditutup.')
        }
      }
      return submitEventOrders(tx, event.id, now)
    })
  })

/**
 * Partner mengisi jumlah yang disetujui untuk setiap baris pengajuan pada satu
 * submit. Partner tidak melihat nama pemesan atau harga jual.
 */
export const reviewSubmissionBatch = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      submissionId: idSchema,
      itemDecisions: z.array(decisionSchema),
      componentDecisions: z.array(decisionSchema),
    }),
  )
  .handler(async ({ data }) => {
    const partner = await requirePartner()
    const { db } = await import('../db')
    const { eventSubmissions, events } = await import('../db/schema')
    const { reviewSubmission } = await import('./submit-queries')

    const submission = await db
      .select({ calendarEventId: events.calendarEventId })
      .from(eventSubmissions)
      .innerJoin(events, eq(events.id, eventSubmissions.eventId))
      .where(eq(eventSubmissions.id, data.submissionId))
      .then((rows) => rows.at(0))
    if (!submission) throw new Error('Submit tidak ditemukan')
    const calendarEventId = submission.calendarEventId
    if (
      !calendarEventId ||
      !(await partnerOwnsEvent(partner.id, calendarEventId))
    ) {
      throw new Error('Event tidak ditemukan')
    }

    return db.transaction(async (tx) => {
      const result = await reviewSubmission(tx, {
        submissionId: data.submissionId,
        itemDecisions: data.itemDecisions,
        componentDecisions: data.componentDecisions,
      })
      return result
    })
  })

/** Partner membuka daftar submit satu event kalender miliknya. */
export const getPartnerSubmissions = createServerFn({ method: 'GET' })
  .validator(z.object({ calendarEventId: idSchema }))
  .handler(async ({ data }) => {
    const partner = await requirePartner()
    if (!(await partnerOwnsEvent(partner.id, data.calendarEventId))) {
      throw new Error('Event tidak ditemukan')
    }
    const { db } = await import('../db')
    const { loadSubmissionsForPartner } =
      await import('./submit-review-queries')
    return db.transaction((tx) =>
      loadSubmissionsForPartner(tx, data.calendarEventId),
    )
  })

/** Partner membatalkan satu baris yang sudah disetujui. Stok kembali ke katalog. */
export const cancelSubmittedRowBatch = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      kind: z.enum(['satuan', 'komponen']),
      id: idSchema,
      calendarEventId: idSchema,
    }),
  )
  .handler(async ({ data }) => {
    const partner = await requirePartner()
    if (!(await partnerOwnsEvent(partner.id, data.calendarEventId))) {
      throw new Error('Event tidak ditemukan')
    }
    const { db } = await import('../db')
    const { cancelSubmittedRow } = await import('./submit-queries')
    return db.transaction((tx) =>
      cancelSubmittedRow(tx, {
        kind: data.kind,
        id: data.id,
        calendarEventId: data.calendarEventId,
      }),
    )
  })


import { createServerFn } from '@tanstack/react-start'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getSessionUser } from './auth'
import { brandIdOf } from './brand'
import { isSlotEnabled, slotPhase } from './event-slot'
import {
  DRAFT_CHANGED_MESSAGE,
  computeDraftTotal,
  draftFingerprint,
  minPurchaseMessage,
  minPurchaseShortfall,
  sameFingerprint,
} from './min-purchase'
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

/**
 * Jastiper menekan Submit. Hanya barang draft yang dikirim. `expected` = sidik
 * isi draft yang tampil di halaman cek; kalau yang terkirim berbeda, atau total
 * submit pertama di bawah minimal pembelian, seluruh submit dibatalkan.
 */
export const submitOrdersBatch = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      eventId: idSchema,
      expected: z.array(z.string().max(60)).max(20_000),
    }),
  )
  .handler(async ({ data }) => {
    const { db } = await import('../db')
    const { eventSubmissions, events } = await import('../db/schema')
    const { loadSlotConfig } = await import('./event-slot-queries')
    const { submitEventOrders } = await import('./submit-queries')
    const { loadDraftSources } = await import('./min-purchase-queries')
    const { loadActiveRules } = await import('./invoice-pooling-queries')
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
      const result = await submitEventOrders(tx, event.id, now)

      // Diperiksa sesudah ditulis, atas baris yang benar-benar terkirim, supaya
      // barang yang masuk bersamaan tidak lolos. Throw = rollback.
      const sent =
        (
          await loadDraftSources(tx, { submissionId: result.submissionId })
        ).get(event.id) ?? []
      if (!sameFingerprint(draftFingerprint(sent), data.expected)) {
        throw new Error(DRAFT_CHANGED_MESSAGE)
      }
      if (isSlotEnabled(config) && config?.partnerId) {
        const { total } = computeDraftTotal(
          sent,
          await loadActiveRules(tx, config.partnerId),
        )
        const shortfall = minPurchaseShortfall({
          total,
          minPurchase: config.minPurchase,
          isFirstSubmit: result.submitNo === 1,
        })
        if (shortfall > 0) {
          throw new Error(minPurchaseMessage(total, config.minPurchase!))
        }
        await tx
          .update(eventSubmissions)
          .set({ submittedTotal: String(total) })
          .where(eq(eventSubmissions.id, result.submissionId))
      }
      return result
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
  .validator(
    z.object({ calendarEventId: idSchema, brandId: idSchema.optional() }),
  )
  .handler(async ({ data }) => {
    const partner = await requirePartner()
    if (!(await partnerOwnsEvent(partner.id, data.calendarEventId))) {
      throw new Error('Event tidak ditemukan')
    }
    const { db } = await import('../db')
    const { loadSubmissionsForPartner } =
      await import('./submit-review-queries')
    return db.transaction((tx) =>
      loadSubmissionsForPartner(tx, data.calendarEventId, data.brandId),
    )
  })

const holeRefSchema = z.object({
  kind: z.enum(['satuan', 'komponen']),
  id: idSchema,
})

/**
 * Jastiper mengirim pengganti untuk barang yang disanggah. Pengganti dibuat
 * sebagai submit baru yang tertaut ke submit asalnya, dan didahulukan di
 * antrean cek. Tetap boleh walau slot sudah ditutup, karena ini koreksi atas
 * submit yang sudah masuk, bukan pesanan baru.
 */
export const sendReplacementsBatch = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      eventId: idSchema,
      replacements: z
        .array(
          z.object({
            hole: holeRefSchema,
            partnerVariantId: idSchema,
            qty: z.number().int().min(1),
          }),
        )
        .min(1)
        .max(200),
    }),
  )
  .handler(async ({ data }) => {
    const { db } = await import('../db')
    const { lockBrandEvent, sendReplacementsTx } = await import(
      './submit-replacement-queries'
    )
    const user = await getSessionUser()
    if (!user) throw new Error('Belum login')

    return db.transaction(async (tx) => {
      const event = await lockBrandEvent(tx, data.eventId, brandIdOf(user))
      if (!event.calendarEventId) {
        throw new Error('Event ini tidak terhubung ke event partner.')
      }
      return sendReplacementsTx(tx, {
        eventId: event.id,
        calendarEventId: event.calendarEventId,
        requests: data.replacements,
        now: new Date(),
      })
    })
  })

/** Jastiper memutuskan barang yang disanggah tidak diganti. */
export const waiveReplacementsBatch = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      eventId: idSchema,
      holes: z.array(holeRefSchema).min(1).max(200),
    }),
  )
  .handler(async ({ data }) => {
    const { db } = await import('../db')
    const { lockBrandEvent, waiveHolesTx } = await import(
      './submit-replacement-queries'
    )
    const user = await getSessionUser()
    if (!user) throw new Error('Belum login')

    return db.transaction(async (tx) => {
      const event = await lockBrandEvent(tx, data.eventId, brandIdOf(user))
      await waiveHolesTx(tx, {
        eventId: event.id,
        holes: data.holes,
        by: 'jastiper',
        now: new Date(),
      })
    })
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


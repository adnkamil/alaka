import { createServerFn } from '@tanstack/react-start'
import { and, eq, min } from 'drizzle-orm'
import { z } from 'zod'
import {
  parseWibLocal,
  validateSlotChange,
  validateSlotWindow,
} from './event-slot'
import { requirePartner } from './partner-auth'
import { partnerOwnsEvent } from './partner-event-queries'

/**
 * Server function alur slot sisi partner. SETIAP handler wajib
 * `requirePartner()` + cek kepemilikan event. Partner tidak pernah menerima
 * nama pemesan atau harga jual: pengecekan dilakukan per varian.
 */

const idSchema = z.uuid()
const dateTimeLocal = z.string().max(16)

/** Waktu buka dan tutup slot (jam dinding WIB, format datetime-local). Kosong keduanya = alur lama. */
export const setPartnerSlotWindow = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      calendarEventId: idSchema,
      opensAt: dateTimeLocal,
      closesAt: dateTimeLocal,
    }),
  )
  .handler(async ({ data }) => {
    const partner = await requirePartner()
    if (!(await partnerOwnsEvent(partner.id, data.calendarEventId))) {
      throw new Error('Event tidak ditemukan')
    }
    const opensAt = data.opensAt === '' ? null : parseWibLocal(data.opensAt)
    const closesAt = data.closesAt === '' ? null : parseWibLocal(data.closesAt)
    if (data.opensAt !== '' && opensAt === null) {
      throw new Error('Waktu buka slot tidak valid.')
    }
    if (data.closesAt !== '' && closesAt === null) {
      throw new Error('Waktu tutup slot tidak valid.')
    }
    const problem = validateSlotWindow(opensAt, closesAt)
    if (problem) throw new Error(problem)

    const { db } = await import('../db')
    const { calendarEvents, events } = await import('../db/schema')
    const [current, firstSubmit] = await Promise.all([
      db
        .select({
          opensAt: calendarEvents.slotOpensAt,
          closesAt: calendarEvents.slotClosesAt,
        })
        .from(calendarEvents)
        .where(eq(calendarEvents.id, data.calendarEventId))
        .then((rows) => rows.at(0)),
      db
        .select({ at: min(events.submittedAt) })
        .from(events)
        .where(eq(events.calendarEventId, data.calendarEventId))
        .then((rows) => rows.at(0)),
    ])
    const changeProblem = validateSlotChange({
      current: {
        opensAt: current?.opensAt ?? null,
        closesAt: current?.closesAt ?? null,
      },
      next: { opensAt, closesAt },
      earliestSubmittedAt: firstSubmit?.at ?? null,
    })
    if (changeProblem) throw new Error(changeProblem)
    await db
      .update(calendarEvents)
      .set({
        slotOpensAt: opensAt,
        slotClosesAt: closesAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(calendarEvents.id, data.calendarEventId),
          eq(calendarEvents.partnerId, partner.id),
        ),
      )
    return { opensAt, closesAt }
  })

/** Pengaturan slot event ini (null = belum diatur). */
export const getPartnerSlotWindow = createServerFn({ method: 'GET' })
  .validator(z.object({ calendarEventId: idSchema }))
  .handler(async ({ data }) => {
    const partner = await requirePartner()
    if (!(await partnerOwnsEvent(partner.id, data.calendarEventId))) {
      throw new Error('Event tidak ditemukan')
    }
    const { db } = await import('../db')
    const { calendarEvents } = await import('../db/schema')
    const rows = await db
      .select({
        opensAt: calendarEvents.slotOpensAt,
        closesAt: calendarEvents.slotClosesAt,
      })
      .from(calendarEvents)
      .where(eq(calendarEvents.id, data.calendarEventId))
    return rows.at(0) ?? { opensAt: null, closesAt: null }
  })

/** Antrean jastiper berurutan sesuai urutan submit, lengkap dengan statusnya. */
export const getPartnerSlotQueue = createServerFn({ method: 'GET' })
  .validator(z.object({ calendarEventId: idSchema }))
  .handler(async ({ data }) => {
    const partner = await requirePartner()
    if (!(await partnerOwnsEvent(partner.id, data.calendarEventId))) {
      throw new Error('Event tidak ditemukan')
    }
    const { db } = await import('../db')
    const {
      listSlotQueue,
      listEventsWithExpiredSanggah,
      resolveExpiredSanggah,
    } = await import('./event-slot-queries')
    const { events } = await import('../db/schema')
    return db.transaction(async (tx) => {
      const now = new Date()
      // Selesaikan sanggah yang lewat batas untuk event ini (default: tidak ganti).
      const expired = new Set(await listEventsWithExpiredSanggah(tx, now))
      const mine = await tx
        .select({ id: events.id })
        .from(events)
        .where(eq(events.calendarEventId, data.calendarEventId))
      for (const { id } of mine) {
        if (expired.has(id)) await resolveExpiredSanggah(tx, id, now)
      }
      return listSlotQueue(tx, data.calendarEventId, now)
    })
  })

async function loadJastiperEvent(calendarEventId: string, brandId: string) {
  const { db } = await import('../db')
  const { events } = await import('../db/schema')
  const event = await db
    .select()
    .from(events)
    .where(
      and(
        eq(events.calendarEventId, calendarEventId),
        eq(events.brandId, brandId),
      ),
    )
    .then((rows) => rows.at(0))
  if (!event) throw new Error('Jastiper tidak ikut event ini')
  return event
}

/** Rekap per varian untuk pengecekan satu jastiper (tanpa nama pemesan). */
export const getPartnerReviewGroups = createServerFn({ method: 'GET' })
  .validator(z.object({ calendarEventId: idSchema, brandId: idSchema }))
  .handler(async ({ data }) => {
    const partner = await requirePartner()
    if (!(await partnerOwnsEvent(partner.id, data.calendarEventId))) {
      throw new Error('Event tidak ditemukan')
    }
    const event = await loadJastiperEvent(data.calendarEventId, data.brandId)
    const { db } = await import('../db')
    const { loadReviewGroups, getSlotSummary } =
      await import('./event-slot-queries')
    const { calendarEvents } = await import('../db/schema')
    return db.transaction(async (tx) => {
      const summary = await getSlotSummary(tx, event, new Date())
      const calendarEvent = await tx
        .select({ name: calendarEvents.name })
        .from(calendarEvents)
        .where(eq(calendarEvents.id, data.calendarEventId))
        .then((rows) => rows.at(0))
      return {
        status: summary?.status ?? null,
        sanggahCount: Object.values(summary?.bundleStates ?? {}).filter(
          (state) => state === 'sanggah',
        ).length,
        eventName: calendarEvent?.name ?? '',
        submittedAt: event.submittedAt,
        reviewedAt: event.reviewedAt,
        sanggahDeadline: event.sanggahDeadline,
        groups: event.submittedAt ? await loadReviewGroups(tx, event.id) : [],
      }
    })
  })

const resultSchema = z.object({
  variantId: idSchema,
  approvedPcs: z.number().int().min(0).optional(),
  pendingApprovedPcs: z.number().int().min(0).optional(),
})

/**
 * Simpan hasil pengecekan. Pengecekan pertama wajib menyertakan batas waktu
 * sanggah; setelahnya dipakai untuk koreksi dan verifikasi barang pengganti.
 */
export const savePartnerReview = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      calendarEventId: idSchema,
      brandId: idSchema,
      results: z.array(resultSchema).max(500),
      /** datetime-local WIB. Kosong = tidak mengubah batas. */
      sanggahDeadline: dateTimeLocal.default(''),
    }),
  )
  .handler(async ({ data }) => {
    const partner = await requirePartner()
    if (!(await partnerOwnsEvent(partner.id, data.calendarEventId))) {
      throw new Error('Event tidak ditemukan')
    }
    const event = await loadJastiperEvent(data.calendarEventId, data.brandId)
    const deadline =
      data.sanggahDeadline === '' ? null : parseWibLocal(data.sanggahDeadline)
    if (data.sanggahDeadline !== '' && deadline === null) {
      throw new Error('Batas waktu sanggah tidak valid.')
    }
    const { db } = await import('../db')
    const { saveReviewResults } = await import('./event-slot-queries')
    return db.transaction((tx) =>
      saveReviewResults(tx, {
        eventId: event.id,
        results: data.results,
        deadline,
        now: new Date(),
      }),
    )
  })

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
    const { listSlotQueue } = await import('./event-slot-queries')
    return db.transaction(async (tx) => {
      return listSlotQueue(tx, data.calendarEventId, new Date())
    })
  })

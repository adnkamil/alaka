import { and, asc, eq, sql } from 'drizzle-orm'
import { db } from '../db'
import { brands, calendarEvents, events, feeRules, orders } from '../db/schema'
import {
  JOIN_ERRORS,
  buildJoinedEventValues,
  isCalendarEventJoinable,
} from './calendar-join'
import { todayIsoDateInAppTimeZone } from './timezone'

/**
 * Query server-only untuk "Ikut Event" (jastiper ikut event kalender) dan
 * daftar pesertanya. Server-only karena menyentuh `db`, jadi sengaja
 * `*-queries.ts` — lihat `client-bundle-safety.test.ts`.
 *
 * Satu "peserta" = satu baris `events` milik brand dengan
 * `calendar_event_id` = id event kalender.
 */

/** Event belanja milik brand untuk event kalender ini, atau null kalau belum ikut. */
export async function findJoinedEventId(
  brandId: string,
  calendarEventId: string,
): Promise<string | null> {
  const rows = await db
    .select({ id: events.id })
    .from(events)
    .where(
      and(
        eq(events.brandId, brandId),
        eq(events.calendarEventId, calendarEventId),
      ),
    )
    .limit(1)
  return rows.at(0)?.id ?? null
}

/**
 * Brand ikut event kalender: membuat event belanja baru (nama, tanggal,
 * lokasi, deskripsi dari event kalender; tanpa produk) di brand tersebut.
 *
 * Idempoten: kalau brand sudah ikut, event yang sudah ada dikembalikan
 * (`created: false`) tanpa membuat yang baru. Dobel klik / dua perangkat
 * sekaligus juga aman karena dijaga unique index di DB.
 */
export async function joinCalendarEventForBrand(input: {
  userId: string
  brandId: string
  calendarEventId: string
  feeRuleId: string | null
}): Promise<{ eventId: string; created: boolean }> {
  const existing = await findJoinedEventId(input.brandId, input.calendarEventId)
  if (existing) return { eventId: existing, created: false }

  const calendarRows = await db
    .select()
    .from(calendarEvents)
    .where(eq(calendarEvents.id, input.calendarEventId))
  const calendarEvent = calendarRows.at(0)
  if (!calendarEvent) throw new Error(JOIN_ERRORS.notFound)

  if (
    !isCalendarEventJoinable(
      {
        eventDate: calendarEvent.eventDate,
        endDate: calendarEvent.endDate,
        isEnded: calendarEvent.endedAt !== null,
      },
      todayIsoDateInAppTimeZone(),
    )
  ) {
    throw new Error(JOIN_ERRORS.notJoinable)
  }

  const brandRows = await db
    .select({ waNumber: brands.waNumber })
    .from(brands)
    .where(eq(brands.id, input.brandId))
  if (!brandRows.at(0)?.waNumber) throw new Error(JOIN_ERRORS.waRequired)

  if (input.feeRuleId) {
    const ruleRows = await db
      .select({ id: feeRules.id })
      .from(feeRules)
      .where(
        and(
          eq(feeRules.id, input.feeRuleId),
          eq(feeRules.brandId, input.brandId),
        ),
      )
    if (ruleRows.length === 0) throw new Error(JOIN_ERRORS.feeRuleNotFound)
  }

  const values = buildJoinedEventValues(calendarEvent)
  const inserted = await db
    .insert(events)
    .values({
      ...values,
      userId: input.userId,
      brandId: input.brandId,
      calendarEventId: calendarEvent.id,
      feeRuleId: input.feeRuleId,
    })
    .onConflictDoNothing()
    .returning({ id: events.id })

  const insertedRow = inserted.at(0)
  if (insertedRow) return { eventId: insertedRow.id, created: true }

  // Kalah balapan dengan permintaan lain: pakai event yang sudah terbentuk.
  const winner = await findJoinedEventId(input.brandId, input.calendarEventId)
  if (!winner) throw new Error('Gagal ikut event. Coba lagi.')
  return { eventId: winner, created: false }
}

/**
 * Daftar jastiper (brand) yang ikut satu event kalender, urut dari yang
 * paling awal ikut. `joinedAt` = waktu event belanjanya dibuat; `orderCount` = jumlah
 * pesanan di event belanja itu.
 *
 * TIDAK mengecek siapa yang memanggil: pemanggil WAJIB sudah memverifikasi
 * haknya sendiri (admin ALAKA lewat `requireAdminUser()`; Partner Portal
 * nanti lewat autentikasi partner yang memiliki event tersebut). Data yang
 * dikembalikan sengaja terbatas: kontak dasar dan jumlah pesanan, tanpa isi
 * pesanan, pelanggan, atau nominal.
 */
export async function listCalendarEventParticipants(calendarEventId: string) {
  return db
    .select({
      brandId: brands.id,
      brandName: brands.name,
      waNumber: brands.waNumber,
      joinedAt: events.createdAt,
      // Hanya pesanan di event belanja hasil "Ikut Event" ini, bukan semua
      // pesanan brand di event lain.
      orderCount: sql<number>`(select count(*) from ${orders} where ${orders.eventId} = ${events.id})::int`,
    })
    .from(events)
    .innerJoin(brands, eq(events.brandId, brands.id))
    .where(eq(events.calendarEventId, calendarEventId))
    .orderBy(asc(events.createdAt))
}

export type CalendarEventParticipant = Awaited<
  ReturnType<typeof listCalendarEventParticipants>
>[number]

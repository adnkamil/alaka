import { and, asc, eq, sql } from 'drizzle-orm'
import { db } from '../db'
import { calendarEvents } from '../db/schema'
import { calendarBannerSrc } from './calendar'
import type { CalendarEventFields } from './calendar-event-input'

/**
 * Event milik partner (baris `calendar_event` dengan `partner_id` terisi).
 * Server-only. SEMUA query dibatasi `partnerId` dari sesi partner
 * (`requirePartner()`), jadi partner tidak bisa membaca/mengubah event partner
 * lain atau event buatan admin walaupun menebak id-nya.
 */

export type PartnerEventRow = {
  id: string
  name: string
  location: string
  eventDate: string
  endDate: string | null
  isOnline: boolean
  isEnded: boolean
  description: string | null
  bannerSrc: string | null
  /** Jumlah jastiper (brand) yang menekan "Ikut Event". */
  participantCount: number
}

// Tabel ditulis lengkap (bukan `${events.x}` / `${calendarEvents.id}`): untuk
// query satu-tabel Drizzle membuang awalan tabel dari kolom, sehingga
// `calendar_event_id = id` di dalam subquery akan membandingkan kolom `events`
// dengan dirinya sendiri dan selalu menghasilkan 0.
const participantCount = sql<number>`(select count(*) from "events" "pe" where "pe"."calendar_event_id" = "calendar_event"."id")::int`

const columns = {
  id: calendarEvents.id,
  name: calendarEvents.name,
  location: calendarEvents.location,
  eventDate: calendarEvents.eventDate,
  endDate: calendarEvents.endDate,
  isOnline: calendarEvents.isOnline,
  endedAt: calendarEvents.endedAt,
  description: calendarEvents.description,
  bannerUpdatedAt: calendarEvents.bannerUpdatedAt,
  participantCount,
}

function toRow(row: {
  id: string
  name: string
  location: string
  eventDate: string
  endDate: string | null
  isOnline: boolean
  endedAt: Date | null
  description: string | null
  bannerUpdatedAt: Date | null
  participantCount: number
}): PartnerEventRow {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    eventDate: row.eventDate,
    endDate: row.endDate,
    isOnline: row.isOnline,
    isEnded: row.endedAt !== null,
    description: row.description,
    bannerSrc: calendarBannerSrc(row.id, row.bannerUpdatedAt),
    participantCount: row.participantCount,
  }
}

/** Semua event partner, tanggal terbaru di atas. */
export async function listPartnerEvents(
  partnerId: string,
): Promise<Array<PartnerEventRow>> {
  const rows = await db
    .select(columns)
    .from(calendarEvents)
    .where(eq(calendarEvents.partnerId, partnerId))
    .orderBy(sql`${calendarEvents.eventDate} desc`, asc(calendarEvents.name))
  return rows.map(toRow)
}

export async function getPartnerEvent(
  partnerId: string,
  id: string,
): Promise<PartnerEventRow | null> {
  const rows = await db
    .select(columns)
    .from(calendarEvents)
    .where(
      and(eq(calendarEvents.id, id), eq(calendarEvents.partnerId, partnerId)),
    )
    .limit(1)
  return rows.length > 0 ? toRow(rows[0]) : null
}

/** Apakah event ini milik partner tsb? (cek kepemilikan sebelum menyentuh file/peserta) */
export async function partnerOwnsEvent(
  partnerId: string,
  id: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: calendarEvents.id })
    .from(calendarEvents)
    .where(
      and(eq(calendarEvents.id, id), eq(calendarEvents.partnerId, partnerId)),
    )
    .limit(1)
  return rows.length > 0
}

type EventFields = Omit<CalendarEventFields, 'exhibitors' | 'description'> & {
  description: string | null
}

export async function insertPartnerEvent(input: {
  id: string
  partnerId: string
  /** Nama partner → satu-satunya "brand yang dipamerkan". */
  exhibitor: string
  fields: EventFields
  /** Tanggal terakhir yang sudah dinormalkan (null = event sehari). */
  endDate: string | null
  bannerUpdatedAt: Date | null
}) {
  await db.insert(calendarEvents).values({
    id: input.id,
    partnerId: input.partnerId,
    name: input.fields.name,
    location: input.fields.location,
    eventDate: input.fields.eventDate,
    endDate: input.endDate,
    isOnline: input.fields.isOnline,
    description: input.fields.description,
    exhibitors: [input.exhibitor],
    bannerUpdatedAt: input.bannerUpdatedAt,
  })
}

/**
 * Ubah event milik partner. `bannerUpdatedAt`: undefined = tidak diubah, null =
 * banner dihapus, Date = banner baru. Daftar brand yang dipamerkan sengaja
 * tidak disentuh (admin bisa mengubahnya). Mengembalikan false kalau event
 * bukan milik partner.
 */
export async function updatePartnerEvent(input: {
  partnerId: string
  id: string
  fields: EventFields
  endDate: string | null
  bannerUpdatedAt: Date | null | undefined
}): Promise<boolean> {
  const rows = await db
    .update(calendarEvents)
    .set({
      name: input.fields.name,
      location: input.fields.location,
      eventDate: input.fields.eventDate,
      endDate: input.endDate,
      isOnline: input.fields.isOnline,
      description: input.fields.description,
      bannerUpdatedAt: input.bannerUpdatedAt,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(calendarEvents.id, input.id),
        eq(calendarEvents.partnerId, input.partnerId),
      ),
    )
    .returning({ id: calendarEvents.id })
  return rows.length > 0
}

/** Akhiri (`ended: true`) atau buka kembali event milik partner. */
export async function setPartnerEventEnded(
  partnerId: string,
  id: string,
  ended: boolean,
): Promise<boolean> {
  const rows = await db
    .update(calendarEvents)
    .set(
      ended
        ? {
            endedAt: sql`coalesce(${calendarEvents.endedAt}, now())`,
            updatedAt: new Date(),
          }
        : { endedAt: null, updatedAt: new Date() },
    )
    .where(
      and(eq(calendarEvents.id, id), eq(calendarEvents.partnerId, partnerId)),
    )
    .returning({ id: calendarEvents.id })
  return rows.length > 0
}

import { and, asc, eq, isNotNull, isNull, or, sql } from 'drizzle-orm'
import { db } from '../db'
import { calendarEvents } from '../db/schema'
import { calendarBannerSrc } from './calendar'
import { clampPage, pageOffset } from './pagination'
import { todayIsoDateInAppTimeZone } from './timezone'
import type { Paged } from './pagination'
import type { PartnerEventStatus } from './partner-event-rules'
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
  /** Link unduh katalog event ini (tersimpan apa adanya); null = tidak ada. */
  catalogUrl: string | null
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
  catalogUrl: calendarEvents.catalogUrl,
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
  catalogUrl: string | null
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
    catalogUrl: row.catalogUrl,
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

export type PartnerEventTab = 'all' | PartnerEventStatus

export type PartnerEventPage = Paged<PartnerEventRow> & {
  /** Jumlah per tab status. */
  counts: Record<PartnerEventTab, number>
}

/**
 * Kondisi SQL untuk status event — SAMA dengan `partnerEventStatus` (murni di
 * `partner-event-rules.ts`): selesai = sudah diakhiri atau hari terakhirnya
 * sudah lewat; mendatang = belum mulai; berjalan = sisanya.
 */
function statusCondition(status: PartnerEventStatus, today: string) {
  const lastDay = sql`coalesce(${calendarEvents.endDate}, ${calendarEvents.eventDate})`
  const startDate = sql`${calendarEvents.eventDate}`
  switch (status) {
    case 'selesai':
      return or(
        isNotNull(calendarEvents.endedAt),
        sql`${lastDay} < ${today}::date`,
      )
    case 'mendatang':
      return and(
        isNull(calendarEvents.endedAt),
        sql`${startDate} > ${today}::date`,
      )
    case 'berjalan':
      return and(
        isNull(calendarEvents.endedAt),
        sql`${startDate} <= ${today}::date`,
        sql`${lastDay} >= ${today}::date`,
      )
  }
}

/**
 * Satu halaman event partner untuk tabel Event: filter tab status dan
 * paginasi dikerjakan di database. Halaman di luar jangkauan dikembalikan
 * sebagai halaman terakhir.
 */
export async function listPartnerEventsPage(
  partnerId: string,
  input: { tab: PartnerEventTab; page: number; pageSize: number },
): Promise<PartnerEventPage> {
  const today = todayIsoDateInAppTimeZone()
  const owned = eq(calendarEvents.partnerId, partnerId)

  const [c] = await db
    .select({
      all: sql<number>`count(*)::int`,
      berjalan: sql<number>`(count(*) filter (where ${statusCondition('berjalan', today)}))::int`,
      mendatang: sql<number>`(count(*) filter (where ${statusCondition('mendatang', today)}))::int`,
      selesai: sql<number>`(count(*) filter (where ${statusCondition('selesai', today)}))::int`,
    })
    .from(calendarEvents)
    .where(owned)
  const counts: Record<PartnerEventTab, number> = {
    all: c.all,
    berjalan: c.berjalan,
    mendatang: c.mendatang,
    selesai: c.selesai,
  }

  const total = counts[input.tab]
  const page = clampPage(input.page, total, input.pageSize)
  const where =
    input.tab === 'all' ? owned : and(owned, statusCondition(input.tab, today))

  const rows = await db
    .select(columns)
    .from(calendarEvents)
    .where(where)
    .orderBy(
      sql`${calendarEvents.eventDate} desc`,
      asc(calendarEvents.name),
      asc(calendarEvents.id),
    )
    .limit(input.pageSize)
    .offset(pageOffset(page, input.pageSize))

  return {
    rows: rows.map(toRow),
    total,
    page,
    pageSize: input.pageSize,
    counts,
  }
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
  /** Link katalog yang sudah divalidasi (null = tanpa katalog). */
  catalogUrl: string | null
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
    catalogUrl: input.catalogUrl,
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
  /** Link katalog yang sudah divalidasi; null = hapus katalog. */
  catalogUrl: string | null
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
      catalogUrl: input.catalogUrl,
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

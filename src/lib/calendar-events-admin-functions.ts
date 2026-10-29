import { createServerFn } from '@tanstack/react-start'
import { asc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db'
import { calendarEvents, partners, users } from '../db/schema'
import { requireAdminUser } from './admin'
import { calendarBannerSrc } from './calendar'
import { listCalendarEventParticipants } from './calendar-join-queries'
import {
  CALENDAR_BANNER_MAX_DATA_URL_LENGTH,
  parseCalendarBannerDataUrl,
} from './calendar-banner'
import {
  END_DATE_ERROR,
  calendarEventFieldsSchema,
  isEndDateValid,
  normalizeEndDate,
  normalizeExhibitors,
} from './calendar-event-input'
import { deleteCalendarBanner, putCalendarBanner } from './storage'

/**
 * Pengelolaan event kalender oleh admin ALAKA. SETIAP handler di sini wajib
 * memanggil `requireAdminUser()` di baris pertama (lihat `src/lib/admin.ts`).
 */

const bannerUploadSchema = z.object({
  type: z.literal('upload'),
  // Data URL WebP/JPEG hasil potong 16:9 di client. Isinya dicek ulang di
  // `parseCalendarBannerDataUrl` — client tidak dipercaya.
  dataUrl: z
    .string()
    .max(CALENDAR_BANNER_MAX_DATA_URL_LENGTH, 'Banner terlalu besar'),
})

const createSchema = calendarEventFieldsSchema
  .extend({
    banner: bannerUploadSchema.optional(),
  })
  .refine((value) => isEndDateValid(value.eventDate, value.endDate), {
    message: END_DATE_ERROR,
    path: ['endDate'],
  })

const updateSchema = calendarEventFieldsSchema
  .extend({
    id: z.uuid(),
    /** undefined = banner tidak diubah. */
    banner: z
      .union([bannerUploadSchema, z.object({ type: z.literal('remove') })])
      .optional(),
  })
  .refine((value) => isEndDateValid(value.eventDate, value.endDate), {
    message: END_DATE_ERROR,
    path: ['endDate'],
  })

/** Semua event kalender (yang lampau juga), terurut tanggal naik. */
export const fetchAdminCalendarEvents = createServerFn({
  method: 'GET',
}).handler(async () => {
  await requireAdminUser()

  const rows = await db
    .select({
      event: calendarEvents,
      partnerName: partners.name,
      partnerEmail: partners.email,
      adminName: users.name,
      adminEmail: users.email,
      // Jastiper = brand berbeda yang punya event belanja hasil "Ikut Event".
      // Nama tabel ditulis lengkap: Drizzle membuang prefiks tabel pada kolom
      // di dalam `sql` subquery.
      jastiperCount: sql<number>`(select count(distinct e.brand_id)::int from events e where e.calendar_event_id = "calendar_event"."id")`,
    })
    .from(calendarEvents)
    .leftJoin(partners, eq(partners.id, calendarEvents.partnerId))
    .leftJoin(users, eq(users.id, calendarEvents.createdBy))
    .orderBy(asc(calendarEvents.eventDate), asc(calendarEvents.name))

  return rows.map(({ event: row, ...extra }) => ({
    id: row.id,
    name: row.name,
    location: row.location,
    eventDate: row.eventDate,
    endDate: row.endDate,
    isOnline: row.isOnline,
    isEnded: row.endedAt !== null,
    description: row.description,
    exhibitors: row.exhibitors,
    bannerSrc: calendarBannerSrc(row.id, row.bannerUpdatedAt),
    jastiperCount: extra.jastiperCount,
    /**
     * Pembuat event: partner (lewat Partner Portal) atau admin ALAKA. Event
     * seed / partner yang sudah dihapus tidak punya akun → `email` null.
     */
    creator: row.partnerId
      ? {
          kind: 'partner' as const,
          name: extra.partnerName ?? 'Partner',
          email: extra.partnerEmail,
        }
      : {
          kind: 'admin' as const,
          name: extra.adminName ?? 'Admin ALAKA',
          email: extra.adminEmail,
        },
  }))
})

export const createCalendarEvent = createServerFn({ method: 'POST' })
  .validator(createSchema)
  .handler(async ({ data }) => {
    const admin = await requireAdminUser()

    // Id dibuat di sini supaya file banner bisa disimpan DULU (key = id event),
    // baru barisnya ditulis — pola yang sama dengan `uploadAvatar`.
    const id = crypto.randomUUID()
    let bannerUpdatedAt: Date | null = null
    if (data.banner) {
      const { bytes, contentType } = parseCalendarBannerDataUrl(
        data.banner.dataUrl,
      )
      await putCalendarBanner(id, bytes, contentType)
      bannerUpdatedAt = new Date()
    }

    try {
      await db.insert(calendarEvents).values({
        id,
        name: data.name,
        location: data.location,
        eventDate: data.eventDate,
        endDate: normalizeEndDate(data.eventDate, data.endDate),
        isOnline: data.isOnline,
        description: data.description || null,
        exhibitors: normalizeExhibitors(data.exhibitors),
        bannerUpdatedAt,
        createdBy: admin.id,
      })
    } catch (error) {
      // Insert gagal: jangan tinggalkan file yatim di Blobs.
      if (bannerUpdatedAt) await deleteCalendarBanner(id).catch(() => {})
      throw error
    }
    return { id }
  })

export const updateCalendarEvent = createServerFn({ method: 'POST' })
  .validator(updateSchema)
  .handler(async ({ data }) => {
    await requireAdminUser()

    const existing = await db.query.calendarEvents.findFirst({
      where: eq(calendarEvents.id, data.id),
      columns: { id: true },
    })
    if (!existing) throw new Error('Event tidak ditemukan')

    let bannerUpdatedAt: Date | null | undefined
    if (data.banner?.type === 'upload') {
      const { bytes, contentType } = parseCalendarBannerDataUrl(
        data.banner.dataUrl,
      )
      await putCalendarBanner(data.id, bytes, contentType)
      bannerUpdatedAt = new Date()
    } else if (data.banner?.type === 'remove') {
      await deleteCalendarBanner(data.id)
      bannerUpdatedAt = null
    }

    await db
      .update(calendarEvents)
      .set({
        name: data.name,
        location: data.location,
        eventDate: data.eventDate,
        endDate: normalizeEndDate(data.eventDate, data.endDate),
        isOnline: data.isOnline,
        description: data.description || null,
        exhibitors: normalizeExhibitors(data.exhibitors),
        // undefined = kolom tidak disentuh.
        bannerUpdatedAt,
        updatedAt: new Date(),
      })
      .where(eq(calendarEvents.id, data.id))
    return { id: data.id }
  })

/**
 * Akhiri event (`ended: true`) atau buka kembali (`ended: false`). Event yang
 * diakhiri langsung hilang dari daftar user, datanya tetap tersimpan.
 * Mengakhiri event yang sudah berakhir tidak mengubah waktu akhirnya.
 */
export const setCalendarEventEnded = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.uuid(), ended: z.boolean() }))
  .handler(async ({ data }) => {
    await requireAdminUser()

    const updated = await db
      .update(calendarEvents)
      .set(
        data.ended
          ? {
              endedAt: sql`coalesce(${calendarEvents.endedAt}, now())`,
              updatedAt: new Date(),
            }
          : { endedAt: null, updatedAt: new Date() },
      )
      .where(eq(calendarEvents.id, data.id))
      .returning({ id: calendarEvents.id })
    if (updated.length === 0) throw new Error('Event tidak ditemukan')
    return { id: data.id, ended: data.ended }
  })

export const deleteCalendarEvent = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    await requireAdminUser()

    const deleted = await db
      .delete(calendarEvents)
      .where(eq(calendarEvents.id, data.id))
      .returning({ id: calendarEvents.id })
    if (deleted.length === 0) throw new Error('Event tidak ditemukan')

    // Barisnya sudah hilang; kegagalan hapus file tidak boleh menggagalkan aksi.
    await deleteCalendarBanner(data.id).catch(() => {})
    return { id: data.id }
  })

/**
 * Jastiper yang ikut satu event kalender (tabel "Peserta" di halaman admin).
 * Query yang sama dipakai Partner Portal nanti, dengan pengecekan hak akses
 * milik portal itu sendiri.
 */
export const fetchCalendarEventParticipants = createServerFn({
  method: 'GET',
})
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    await requireAdminUser()
    return listCalendarEventParticipants(data.id)
  })

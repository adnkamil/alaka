import { createServerFn } from '@tanstack/react-start'
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db'
import { calendarEvents } from '../db/schema'
import { requireAdminUser } from './admin'
import { calendarBannerSrc } from './calendar'
import {
  CALENDAR_BANNER_MAX_DATA_URL_LENGTH,
  parseCalendarBannerDataUrl,
} from './calendar-banner'
import {
  calendarEventFieldsSchema,
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

const createSchema = calendarEventFieldsSchema.extend({
  banner: bannerUploadSchema.optional(),
})

const updateSchema = calendarEventFieldsSchema.extend({
  id: z.uuid(),
  /** undefined = banner tidak diubah. */
  banner: z
    .union([bannerUploadSchema, z.object({ type: z.literal('remove') })])
    .optional(),
})

/** Semua event kalender (yang lampau juga), terurut tanggal naik. */
export const fetchAdminCalendarEvents = createServerFn({
  method: 'GET',
}).handler(async () => {
  await requireAdminUser()

  const rows = await db
    .select()
    .from(calendarEvents)
    .orderBy(asc(calendarEvents.eventDate), asc(calendarEvents.name))

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    location: row.location,
    eventDate: row.eventDate,
    description: row.description,
    exhibitors: row.exhibitors,
    bannerSrc: calendarBannerSrc(row.id, row.bannerUpdatedAt),
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
        description: data.description || null,
        exhibitors: normalizeExhibitors(data.exhibitors),
        // undefined = kolom tidak disentuh.
        bannerUpdatedAt,
        updatedAt: new Date(),
      })
      .where(eq(calendarEvents.id, data.id))
    return { id: data.id }
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

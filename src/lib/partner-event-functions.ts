import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  CALENDAR_BANNER_MAX_DATA_URL_LENGTH,
  parseCalendarBannerDataUrl,
} from './calendar-banner'
import {
  END_DATE_ERROR,
  calendarEventFieldsSchema,
  isEndDateValid,
  normalizeEndDate,
} from './calendar-event-input'
import { listCalendarEventParticipants } from './calendar-join-queries'
import { requirePartner } from './partner-auth'
import {
  getPartnerEvent,
  insertPartnerEvent,
  listPartnerEvents,
  partnerOwnsEvent,
  setPartnerEventEnded,
  updatePartnerEvent,
} from './partner-event-queries'
import { deleteCalendarBanner, putCalendarBanner } from './storage'

/**
 * Server function event partner. SETIAP handler wajib `requirePartner()` di
 * baris pertama; `partnerId` selalu dari sesi, tidak pernah dari input. Pola dan
 * validasinya sama dengan `calendar-events-admin-functions.ts`.
 */

const idSchema = z.string().uuid()

const bannerUploadSchema = z.object({
  type: z.literal('upload'),
  // Data URL WebP/JPEG hasil potong 16:9 di client. Dicek ulang di server.
  dataUrl: z
    .string()
    .max(CALENDAR_BANNER_MAX_DATA_URL_LENGTH, 'Banner terlalu besar'),
})

// "Brand yang dipamerkan" diisi server (= nama partner), bukan input.
const partnerEventFieldsSchema = calendarEventFieldsSchema.omit({
  exhibitors: true,
})

const createSchema = partnerEventFieldsSchema
  .extend({ banner: bannerUploadSchema.optional() })
  .refine((value) => isEndDateValid(value.eventDate, value.endDate), {
    message: END_DATE_ERROR,
    path: ['endDate'],
  })

const updateSchema = partnerEventFieldsSchema
  .extend({
    id: idSchema,
    /** undefined = banner tidak diubah. */
    banner: z
      .union([bannerUploadSchema, z.object({ type: z.literal('remove') })])
      .optional(),
  })
  .refine((value) => isEndDateValid(value.eventDate, value.endDate), {
    message: END_DATE_ERROR,
    path: ['endDate'],
  })

export const fetchPartnerEvents = createServerFn({ method: 'GET' }).handler(
  async () => {
    const partner = await requirePartner()
    return listPartnerEvents(partner.id)
  },
)

export const fetchPartnerEvent = createServerFn({ method: 'GET' })
  .validator(z.object({ id: idSchema }))
  .handler(async ({ data }) => {
    const partner = await requirePartner()
    const event = await getPartnerEvent(partner.id, data.id)
    if (!event) throw new Error('Event tidak ditemukan')
    return event
  })

export const createPartnerEvent = createServerFn({ method: 'POST' })
  .validator(createSchema)
  .handler(async ({ data }) => {
    const partner = await requirePartner()
    const { banner, ...fields } = data

    // Id dibuat di sini supaya banner bisa disimpan DULU (key = id event), baru
    // barisnya ditulis — sama dengan `createCalendarEvent` milik admin.
    const id = crypto.randomUUID()
    let bannerUpdatedAt: Date | null = null
    if (banner) {
      const { bytes, contentType } = parseCalendarBannerDataUrl(banner.dataUrl)
      await putCalendarBanner(id, bytes, contentType)
      bannerUpdatedAt = new Date()
    }

    try {
      await insertPartnerEvent({
        id,
        partnerId: partner.id,
        exhibitor: partner.name,
        fields: { ...fields, description: fields.description || null },
        endDate: normalizeEndDate(fields.eventDate, fields.endDate),
        bannerUpdatedAt,
      })
    } catch (error) {
      // Insert gagal: jangan tinggalkan file yatim di Blobs.
      if (bannerUpdatedAt) await deleteCalendarBanner(id).catch(() => {})
      throw error
    }
    return { id }
  })

export const updateOwnPartnerEvent = createServerFn({ method: 'POST' })
  .validator(updateSchema)
  .handler(async ({ data }) => {
    const partner = await requirePartner()
    const { id, banner, ...fields } = data

    // Cek kepemilikan DULU, sebelum menyentuh storage: file banner berkunci id
    // event, jadi tanpa cek ini partner lain bisa menimpa banner event orang.
    if (!(await partnerOwnsEvent(partner.id, id))) {
      throw new Error('Event tidak ditemukan')
    }

    let bannerUpdatedAt: Date | null | undefined
    if (banner?.type === 'upload') {
      const { bytes, contentType } = parseCalendarBannerDataUrl(banner.dataUrl)
      await putCalendarBanner(id, bytes, contentType)
      bannerUpdatedAt = new Date()
    } else if (banner?.type === 'remove') {
      await deleteCalendarBanner(id)
      bannerUpdatedAt = null
    }

    const ok = await updatePartnerEvent({
      partnerId: partner.id,
      id,
      fields: { ...fields, description: fields.description || null },
      endDate: normalizeEndDate(fields.eventDate, fields.endDate),
      bannerUpdatedAt,
    })
    if (!ok) throw new Error('Event tidak ditemukan')
    return { id }
  })

/** Akhiri event (hilang dari daftar jastiper) atau buka kembali. */
export const setOwnPartnerEventEnded = createServerFn({ method: 'POST' })
  .validator(z.object({ id: idSchema, ended: z.boolean() }))
  .handler(async ({ data }) => {
    const partner = await requirePartner()
    const ok = await setPartnerEventEnded(partner.id, data.id, data.ended)
    if (!ok) throw new Error('Event tidak ditemukan')
    return { id: data.id, ended: data.ended }
  })

/**
 * Jastiper yang ikut event ini (nama brand, tanggal ikut, jumlah pesanan, No.
 * WhatsApp). Hanya untuk event milik partner yang login.
 */
export const fetchOwnPartnerEventParticipants = createServerFn({
  method: 'GET',
})
  .validator(z.object({ id: idSchema }))
  .handler(async ({ data }) => {
    const partner = await requirePartner()
    if (!(await partnerOwnsEvent(partner.id, data.id))) {
      throw new Error('Event tidak ditemukan')
    }
    return listCalendarEventParticipants(data.id)
  })

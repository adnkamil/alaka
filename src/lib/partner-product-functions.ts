import { syncDefaultVariant } from './partner-default-variant'
import { randomUUID } from 'node:crypto'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  AVATAR_MAX_DATA_URL_LENGTH,
  parseAvatarDataUrl,
} from './avatar-validation'
import { requirePartner } from './partner-auth'
import {
  getPartnerProduct,
  insertPartnerProduct,
  listPartnerProducts,
  updatePartnerProduct,
} from './partner-product-queries'
import {
  PRODUCT_CODE_MAX,
  PRODUCT_DESCRIPTION_MAX,
  PRODUCT_NAME_MAX,
  PRODUCT_PRICE_MAX,
} from './partner-product-rules'
import { deletePartnerProductPhoto, putPartnerProductPhoto } from './storage'

/**
 * Server function katalog partner. SETIAP handler wajib `requirePartner()` di
 * baris pertama; `partnerId` selalu dari sesi, tidak pernah dari input.
 */

const idSchema = z.string().uuid()

// Teks opsional: string kosong dianggap "tidak diisi" (disimpan null).
const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} maksimal ${max} karakter`)
    .transform((value) => (value === '' ? null : value))

const fieldsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Nama produk wajib diisi')
    .max(PRODUCT_NAME_MAX, `Nama maksimal ${PRODUCT_NAME_MAX} karakter`),
  code: optionalText(PRODUCT_CODE_MAX, 'Kode'),
  price: z
    .number()
    .int('Harga harus bilangan bulat')
    .min(0, 'Harga tidak boleh negatif')
    .max(PRODUCT_PRICE_MAX, 'Harga terlalu besar'),
  description: optionalText(PRODUCT_DESCRIPTION_MAX, 'Deskripsi'),
  isActive: z.boolean(),
})

// Data URL WebP/JPEG hasil resize di client. Isinya dicek ulang di
// `parseAvatarDataUrl` — client tidak dipercaya.
const photoDataUrl = z
  .string()
  .max(AVATAR_MAX_DATA_URL_LENGTH, 'Foto terlalu besar')

export const fetchPartnerProducts = createServerFn({ method: 'GET' }).handler(
  async () => {
    const partner = await requirePartner()
    return listPartnerProducts(partner.id)
  },
)

export const fetchPartnerProduct = createServerFn({ method: 'GET' })
  .validator(z.object({ id: idSchema }))
  .handler(async ({ data }) => {
    const partner = await requirePartner()
    const product = await getPartnerProduct(partner.id, data.id)
    if (!product) throw new Error('Produk tidak ditemukan')
    return product
  })

export const createPartnerProduct = createServerFn({ method: 'POST' })
  .validator(fieldsSchema.extend({ photoDataUrl: photoDataUrl.optional() }))
  .handler(async ({ data }) => {
    const partner = await requirePartner()
    const { photoDataUrl: photo, ...fields } = data

    // Id dibuat di sini supaya foto bisa disimpan dengan key = id produk SEBELUM
    // barisnya ada. Kalau insert gagal, file yang tersisa tidak terlihat siapa
    // pun (id-nya tidak dipakai) — kebalikannya (baris tanpa file) lebih buruk.
    const id = randomUUID()
    let photoUpdatedAt: Date | null = null
    if (photo) {
      const { bytes, contentType } = parseAvatarDataUrl(photo)
      await putPartnerProductPhoto(id, bytes, contentType)
      photoUpdatedAt = new Date()
    }
    return insertPartnerProduct(partner.id, id, fields, photoUpdatedAt)
  })

const photoChangeSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('keep') }),
  z.object({ action: z.literal('remove') }),
  z.object({ action: z.literal('replace'), dataUrl: photoDataUrl }),
])

export const updateOwnPartnerProduct = createServerFn({ method: 'POST' })
  .validator(fieldsSchema.extend({ id: idSchema, photo: photoChangeSchema }))
  .handler(async ({ data }) => {
    const partner = await requirePartner()
    const { id, photo, ...fields } = data

    // Cek kepemilikan DULU, sebelum menyentuh storage: file di storage
    // berkunci id produk, jadi tanpa cek ini partner lain bisa menimpa foto.
    const existing = await getPartnerProduct(partner.id, id)
    if (!existing) throw new Error('Produk tidak ditemukan')

    let photoUpdatedAt: Date | null | undefined = undefined
    if (photo.action === 'replace') {
      const { bytes, contentType } = parseAvatarDataUrl(photo.dataUrl)
      await putPartnerProductPhoto(id, bytes, contentType)
      photoUpdatedAt = new Date()
    } else if (photo.action === 'remove') {
      photoUpdatedAt = null
    }

    const updated = await updatePartnerProduct(
      partner.id,
      id,
      fields,
      photoUpdatedAt,
    )
    if (!updated) throw new Error('Produk tidak ditemukan')

    // Harga produk bisa berubah: samakan varian Standar (produk tanpa varian).
    const { db } = await import('../db')
    await syncDefaultVariant(db, id)

    if (photo.action === 'remove') {
      // DB sudah menandai "tanpa foto"; kalau penghapusan file gagal, file
      // yatim tidak terlihat dan ditimpa upload berikutnya.
      try {
        await deletePartnerProductPhoto(id)
      } catch (err) {
        console.error('Gagal menghapus foto produk dari storage:', err)
      }
    }
    return updated
  })

/** Aktifkan/nonaktifkan produk (tersedia langsung dari daftar katalog). */
export const setPartnerProductActive = createServerFn({ method: 'POST' })
  .validator(z.object({ id: idSchema, isActive: z.boolean() }))
  .handler(async ({ data }) => {
    const partner = await requirePartner()
    const updated = await updatePartnerProduct(
      partner.id,
      data.id,
      { isActive: data.isActive },
      undefined,
    )
    if (!updated) throw new Error('Produk tidak ditemukan')
    return updated
  })

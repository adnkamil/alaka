import { Buffer } from 'node:buffer'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requirePartner } from './partner-auth'
import {
  CATALOG_PDF_MAX_BASE64_LENGTH,
  CATALOG_PDF_MAX_BYTES,
  isPdfBytes,
  partnerCatalogUrl,
  safeCatalogFileName,
} from './partner-catalog-rules'
import {
  getPartnerCatalogMeta,
  setPartnerCatalogMeta,
} from './partner-catalog-queries'
import { deletePartnerCatalogPdf, putPartnerCatalogPdf } from './storage'

/**
 * Katalog PDF partner. SETIAP handler wajib `requirePartner()` di baris
 * pertama; `partnerId` selalu dari sesi. Berkas dikirim sebagai base64 lewat
 * server function (cookie sesi hanya andal di server function, bukan di route
 * API mentah) — karena itu batasnya 4 MB, lihat `partner-catalog-rules.ts`.
 */

export const fetchOwnPartnerCatalog = createServerFn({ method: 'GET' }).handler(
  async () => {
    const partner = await requirePartner()
    const meta = await getPartnerCatalogMeta(partner.id)
    if (!meta) return null
    return {
      name: meta.name,
      size: meta.size,
      updatedAt: meta.updatedAt,
      url: partnerCatalogUrl(partner.id, meta.updatedAt),
    }
  },
)

export const uploadPartnerCatalog = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      fileName: z.string().max(255),
      dataBase64: z.string().min(1).max(CATALOG_PDF_MAX_BASE64_LENGTH),
    }),
  )
  .handler(async ({ data }) => {
    const partner = await requirePartner()

    const bytes = new Uint8Array(Buffer.from(data.dataBase64, 'base64'))
    if (bytes.length === 0 || bytes.length > CATALOG_PDF_MAX_BYTES) {
      throw new Error('Ukuran PDF maksimal 4 MB')
    }
    // Tipe diputuskan dari ISI berkas, bukan dari nama/MIME dari browser.
    if (!isPdfBytes(bytes)) throw new Error('Berkas harus berupa PDF')

    const name = safeCatalogFileName(data.fileName, `Katalog ${partner.name}`)
    await putPartnerCatalogPdf(partner.id, bytes)
    await setPartnerCatalogMeta(partner.id, { name, size: bytes.length })
    return { name, size: bytes.length }
  })

export const deletePartnerCatalog = createServerFn({ method: 'POST' }).handler(
  async () => {
    const partner = await requirePartner()
    // Metadata dihapus lebih dulu: begitu itu hilang, katalog tidak tampil lagi
    // di mana pun. Kalau penghapusan berkas gagal, sisanya tak terlihat dan
    // ditimpa unggahan berikutnya.
    await setPartnerCatalogMeta(partner.id, null)
    try {
      await deletePartnerCatalogPdf(partner.id)
    } catch (err) {
      console.error('Gagal menghapus katalog PDF dari storage:', err)
    }
    return { ok: true }
  },
)

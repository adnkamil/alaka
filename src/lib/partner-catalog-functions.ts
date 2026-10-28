import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requirePartner } from './partner-auth'
import {
  getPartnerCatalogUrl,
  setPartnerCatalogUrl,
} from './partner-catalog-queries'
import {
  CATALOG_URL_MAX_LENGTH,
  catalogDownloadUrl,
  catalogHost,
  parseCatalogUrl,
} from './partner-catalog-rules'

/**
 * Link katalog partner. SETIAP handler wajib `requirePartner()` di baris
 * pertama; `partnerId` selalu dari sesi. Katalog tidak diunggah ke ALAKA:
 * partner menempel link unduh (mis. dari Google Drive).
 */

function toCatalog(url: string | null) {
  if (!url) return null
  return {
    /** Link yang ditempel partner, apa adanya (untuk diedit). */
    url,
    /** Link yang dibuka tombol "Unduh" (Drive diubah ke unduh langsung). */
    downloadUrl: catalogDownloadUrl(url),
    host: catalogHost(url),
  }
}

export const fetchOwnPartnerCatalog = createServerFn({
  method: 'GET',
}).handler(async () => {
  const partner = await requirePartner()
  return toCatalog(await getPartnerCatalogUrl(partner.id))
})

/** Simpan link katalog; string kosong = hapus. Divalidasi ulang di server. */
export const saveOwnPartnerCatalogUrl = createServerFn({ method: 'POST' })
  .validator(z.object({ url: z.string().max(CATALOG_URL_MAX_LENGTH + 500) }))
  .handler(async ({ data }) => {
    const partner = await requirePartner()
    const result = parseCatalogUrl(data.url)
    if (!result.ok) throw new Error(result.error)
    await setPartnerCatalogUrl(partner.id, result.url)
    return toCatalog(result.url)
  })

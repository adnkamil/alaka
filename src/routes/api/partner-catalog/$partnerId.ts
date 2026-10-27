import { createFileRoute } from '@tanstack/react-router'
import { getSessionUserFromRequest } from '../../../lib/auth'
import { getPartnerFromRequest } from '../../../lib/partner-auth'
import { getPartnerCatalogMeta } from '../../../lib/partner-catalog-queries'
import { safeCatalogFileName } from '../../../lib/partner-catalog-rules'
import { getPartnerCatalogPdf } from '../../../lib/storage'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Unduh katalog PDF satu partner. Wajib login: jastiper/admin (sesi user) atau
 * partner pemilik katalog itu sendiri (untuk mengecek hasil unggahannya).
 * Selalu `attachment` + `nosniff`, jadi PDF tidak dirender di domain app.
 */
export const Route = createFileRoute('/api/partner-catalog/$partnerId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!UUID_PATTERN.test(params.partnerId)) {
          return new Response('Not found', { status: 404 })
        }

        const user = await getSessionUserFromRequest(request)
        if (!user) {
          const partner = await getPartnerFromRequest(request)
          if (partner?.id !== params.partnerId) {
            return new Response('Login dulu untuk mengunduh katalog', {
              status: 401,
            })
          }
        }

        const meta = await getPartnerCatalogMeta(params.partnerId)
        const data = meta ? await getPartnerCatalogPdf(params.partnerId) : null
        if (!meta || !data) return new Response('Not found', { status: 404 })

        const fileName = safeCatalogFileName(meta.name, 'Katalog')
        // `filename` hanya ASCII (fallback browser lama); nama aslinya lewat
        // `filename*` (RFC 5987).
        const asciiName = fileName.replace(/[^\x20-\x7e]/g, '_')
        return new Response(data, {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Length': String(data.byteLength),
            'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
            'X-Content-Type-Options': 'nosniff',
            // Berisi data yang butuh login: jangan disimpan cache bersama.
            'Cache-Control': 'private, max-age=300',
          },
        })
      },
    },
  },
})

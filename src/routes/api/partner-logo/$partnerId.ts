import { createFileRoute } from '@tanstack/react-router'
import { getPartnerLogo } from '../../../lib/storage'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Menyajikan logo satu partner. Sengaja tanpa login (cuma gambar logo, id
 * berupa UUID acak) supaya bisa tampil di halaman event jastiper. Cache lama
 * karena URL-nya membawa `?v=<logoUpdatedAt>` — ganti logo = URL baru.
 */
export const Route = createFileRoute('/api/partner-logo/$partnerId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!UUID_PATTERN.test(params.partnerId)) {
          return new Response('Not found', { status: 404 })
        }

        const logo = await getPartnerLogo(params.partnerId)
        if (!logo) {
          return new Response('Not found', {
            status: 404,
            headers: { 'Cache-Control': 'public, max-age=60' },
          })
        }

        const versioned = new URL(request.url).searchParams.has('v')
        return new Response(logo.data, {
          status: 200,
          headers: {
            'Content-Type': logo.contentType,
            'Content-Length': String(logo.data.byteLength),
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': versioned
              ? 'public, max-age=31536000, immutable'
              : 'public, max-age=60',
          },
        })
      },
    },
  },
})

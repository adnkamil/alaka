import { createFileRoute } from '@tanstack/react-router'
import { getCalendarBanner } from '../../../lib/storage'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Menyajikan banner satu event kalender. Sama seperti foto brand: sengaja tanpa
 * login (isinya cuma gambar banner, id event berupa UUID acak). URL membawa
 * `?v=<bannerUpdatedAt>`, jadi browser boleh menyimpan cache lama — ganti
 * banner = URL baru.
 */
export const Route = createFileRoute('/api/event-banner/$eventId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!UUID_PATTERN.test(params.eventId)) {
          return new Response('Not found', { status: 404 })
        }

        const banner = await getCalendarBanner(params.eventId)
        if (!banner) {
          return new Response('Not found', {
            status: 404,
            headers: { 'Cache-Control': 'public, max-age=60' },
          })
        }

        const versioned = new URL(request.url).searchParams.has('v')
        return new Response(banner.data, {
          status: 200,
          headers: {
            'Content-Type': banner.contentType,
            'Content-Length': String(banner.data.byteLength),
            'X-Content-Type-Options': 'nosniff',
            // Dengan `?v=` isinya tidak akan berubah untuk URL yang sama.
            'Cache-Control': versioned
              ? 'public, max-age=31536000, immutable'
              : 'public, max-age=60',
          },
        })
      },
    },
  },
})

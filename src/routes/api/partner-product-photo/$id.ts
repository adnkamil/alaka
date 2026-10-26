import { createFileRoute } from '@tanstack/react-router'
import { getPartnerProductPhoto } from '../../../lib/storage'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Menyajikan foto satu produk partner. Sengaja tanpa login (cuma gambar produk,
 * id berupa UUID acak) supaya nanti bisa tampil di halaman event. Cache lama
 * karena URL-nya membawa `?v=<photoUpdatedAt>` — ganti foto = URL baru.
 */
export const Route = createFileRoute('/api/partner-product-photo/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!UUID_PATTERN.test(params.id)) {
          return new Response('Not found', { status: 404 })
        }

        const photo = await getPartnerProductPhoto(params.id)
        if (!photo) {
          return new Response('Not found', {
            status: 404,
            headers: { 'Cache-Control': 'public, max-age=60' },
          })
        }

        const versioned = new URL(request.url).searchParams.has('v')
        return new Response(photo.data, {
          status: 200,
          headers: {
            'Content-Type': photo.contentType,
            'Content-Length': String(photo.data.byteLength),
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

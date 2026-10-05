import { createFileRoute } from '@tanstack/react-router'
import { getAvatar } from '../../../lib/storage'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Menyajikan foto brand milik satu user. Sengaja tanpa login: halamannya
 * cuma gambar logo, dan id user berupa UUID acak. Browser menyimpan cache
 * lama karena URL-nya membawa `?v=<avatarUpdatedAt>` — ganti foto = URL baru.
 */
export const Route = createFileRoute('/api/avatar/$userId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!UUID_PATTERN.test(params.userId)) {
          return new Response('Not found', { status: 404 })
        }

        const avatar = await getAvatar(params.userId)
        if (!avatar) {
          return new Response('Not found', {
            status: 404,
            headers: { 'Cache-Control': 'public, max-age=60' },
          })
        }

        const versioned = new URL(request.url).searchParams.has('v')
        return new Response(avatar.data, {
          status: 200,
          headers: {
            'Content-Type': avatar.contentType,
            'Content-Length': String(avatar.data.byteLength),
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

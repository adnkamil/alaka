import { createFileRoute } from '@tanstack/react-router'
import { getSessionUserFromRequest } from '../../../lib/auth'
import { loadSubscriptionProof } from '../../../lib/subscription-proof-queries'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Bukti transfer itu PRIVAT: jangan pernah disimpan di cache bersama/CDN.
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store' }

/**
 * Menyajikan bukti transfer satu pengajuan PRO. KEBALIKAN dari
 * `/api/avatar/$userId`: wajib login, dan hanya admin atau pemilik pengajuan
 * yang boleh melihat (dicek di `loadSubscriptionProof`).
 */
export const Route = createFileRoute('/api/subscription-proof/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!UUID_PATTERN.test(params.id)) {
          return new Response('Not found', {
            status: 404,
            headers: PRIVATE_HEADERS,
          })
        }

        const viewer = await getSessionUserFromRequest(request)
        if (!viewer) {
          return new Response('Unauthorized', {
            status: 401,
            headers: PRIVATE_HEADERS,
          })
        }

        const proof = await loadSubscriptionProof(viewer, params.id)
        if (!proof) {
          return new Response('Not found', {
            status: 404,
            headers: PRIVATE_HEADERS,
          })
        }

        return new Response(proof.data, {
          status: 200,
          headers: {
            ...PRIVATE_HEADERS,
            'Content-Type': proof.contentType,
            'Content-Length': String(proof.data.byteLength),
            'X-Content-Type-Options': 'nosniff',
          },
        })
      },
    },
  },
})

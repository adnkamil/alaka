import { createFileRoute } from '@tanstack/react-router'
import { getSessionUserFromRequest } from '../../../lib/auth'
import { getPaymentProof } from '../../../lib/storage'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Bukti transfer itu privat: jangan pernah masuk cache bersama.
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store' }

/** Bukti transfer langganan partner. Hanya admin yang boleh melihat. */
export const Route = createFileRoute('/api/partner-subscription-proof/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        if (!UUID_PATTERN.test(params.id)) {
          return new Response('Not found', { status: 404, headers: PRIVATE_HEADERS })
        }
        const viewer = await getSessionUserFromRequest(request)
        if (!viewer) {
          return new Response('Unauthorized', { status: 401, headers: PRIVATE_HEADERS })
        }
        if (!viewer.isAdmin) {
          return new Response('Not found', { status: 404, headers: PRIVATE_HEADERS })
        }
        const proof = await getPaymentProof(params.id)
        if (!proof) {
          return new Response('Not found', { status: 404, headers: PRIVATE_HEADERS })
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

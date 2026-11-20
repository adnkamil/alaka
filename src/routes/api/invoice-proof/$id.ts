import { createFileRoute } from '@tanstack/react-router'
import { and, eq, or } from 'drizzle-orm'
import { getSessionUserFromRequest } from '../../../lib/auth'
import { getPartnerFromRequest } from '../../../lib/partner-auth'
import { getInvoiceProof } from '../../../lib/storage'

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Bukti bayar itu privat: jangan pernah masuk cache bersama.
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store' }

/**
 * Bukti bayar satu tagihan. Hanya partner pemilik tagihan dan jastiper yang
 * ditagih. Selain itu 404 (bukan 403) supaya id tagihan tidak bisa dites.
 */
export const Route = createFileRoute('/api/invoice-proof/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const notFound = () =>
          new Response('Not found', { status: 404, headers: PRIVATE_HEADERS })
        if (!UUID_PATTERN.test(params.id)) return notFound()

        const [partner, user] = await Promise.all([
          getPartnerFromRequest(request),
          getSessionUserFromRequest(request),
        ])
        if (!partner && !user) {
          return new Response('Unauthorized', {
            status: 401,
            headers: PRIVATE_HEADERS,
          })
        }

        const { db } = await import('../../../db')
        const { invoices } = await import('../../../db/schema')
        const owners = [
          partner ? eq(invoices.partnerId, partner.id) : undefined,
          user?.brandId ? eq(invoices.brandId, user.brandId) : undefined,
        ].filter((c) => c !== undefined)
        const row = await db
          .select({ stored: invoices.paymentProofStored })
          .from(invoices)
          .where(and(eq(invoices.id, params.id), or(...owners)))
          .then((rows) => rows.at(0))
        if (!row?.stored) return notFound()

        const proof = await getInvoiceProof(params.id)
        if (!proof) return notFound()
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

/**
 * Baca bukti transfer langganan untuk disajikan ke browser (server-only).
 *
 * Aturan akses: HANYA admin atau pemilik pengajuan. Selain itu hasilnya `null`
 * (route menjawab 404, bukan 403, supaya id pengajuan orang lain tidak bisa
 * dites keberadaannya).
 *
 * Sengaja di file `*-queries.ts` karena menyentuh `db`; lihat
 * `client-bundle-safety.test.ts`.
 */
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { subscriptions } from '../db/schema'
import { parsePaymentProofDataUrl } from './payment-proof'
import { getPaymentProof } from './storage'
import type { PaymentProofContentType } from './payment-proof'

export async function loadSubscriptionProof(
  viewer: { id: string; isAdmin: boolean },
  subscriptionId: string,
): Promise<{
  data: ArrayBuffer
  contentType: PaymentProofContentType
} | null> {
  const row = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.id, subscriptionId),
    columns: {
      userId: true,
      paymentProofImage: true,
      paymentProofStored: true,
    },
  })
  if (!row) return null
  if (!viewer.isAdmin && row.userId !== viewer.id) return null

  // Pengajuan baru: file ada di Blobs.
  if (row.paymentProofStored) return getPaymentProof(subscriptionId)

  // Pengajuan lama: masih base64 di kolom database.
  if (row.paymentProofImage) {
    try {
      const { bytes, contentType } = parsePaymentProofDataUrl(
        row.paymentProofImage,
      )
      // Salin ke ArrayBuffer baru supaya cocok sebagai body Response.
      return { data: new Uint8Array(bytes).buffer, contentType }
    } catch {
      return null
    }
  }

  return null
}

import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { hasPartnerPro } from './partner-entitlement'
import {
  PAYMENT_PROOF_MAX_DATA_URL_LENGTH,
  parsePaymentProofDataUrl,
} from './payment-proof'
import { PRO_DURATION_DAYS, PRO_PLAN_CODE } from './subscription'

/**
 * Langganan PRO untuk akun partner: pengajuan bukti transfer dari sisi partner
 * dan status langganannya. Verifikasi admin ada di `admin-partner-subscription-functions.ts`.
 * Alurnya sama dengan jastiper, tapi tabelnya `partner_subscriptions`.
 */

const submitSchema = z.object({
  paymentProofImage: z
    .string()
    .max(PAYMENT_PROOF_MAX_DATA_URL_LENGTH, 'Ukuran bukti transfer maksimal 1MB'),
})

export const submitPartnerSubscriptionRequest = createServerFn({ method: 'POST' })
  .validator(submitSchema)
  .handler(async ({ data }) => {
    const { requirePartner } = await import('./partner-auth')
    const partner = await requirePartner()
    const { db } = await import('../db')
    const { partnerSubscriptions } = await import('../db/schema')
    const { getSubscriptionSettings } = await import('./subscription-settings-queries')
    const { deletePaymentProof, putPaymentProof } = await import('./storage')

    const proof = parsePaymentProofDataUrl(data.paymentProofImage)

    const pending = await db.query.partnerSubscriptions.findFirst({
      where: and(
        eq(partnerSubscriptions.partnerId, partner.id),
        eq(partnerSubscriptions.status, 'pending'),
      ),
    })
    if (pending) {
      throw new Error('Kamu masih punya pengajuan yang menunggu verifikasi.')
    }

    // Harga diambil saat pengajuan dikirim, supaya perubahan harga nanti tidak
    // mengubah pengajuan yang sudah masuk.
    const settings = await getSubscriptionSettings()

    const id = globalThis.crypto.randomUUID()
    await putPaymentProof(id, proof.bytes, proof.contentType)
    try {
      const [row] = await db
        .insert(partnerSubscriptions)
        .values({
          id,
          partnerId: partner.id,
          planCode: PRO_PLAN_CODE,
          status: 'pending',
          durationDays: PRO_DURATION_DAYS,
          amount: settings?.proPrice ?? '0',
          paymentMethod: 'qris',
          paymentProvider: 'QRIS',
          paymentProofStored: true,
          paidAt: new Date(),
        })
        .returning({ id: partnerSubscriptions.id, status: partnerSubscriptions.status })
      return row
    } catch (err) {
      try {
        await deletePaymentProof(id)
      } catch (cleanupErr) {
        console.error('Gagal membersihkan bukti transfer partner yatim:', cleanupErr)
      }
      throw err
    }
  })

/** QRIS dan harga PRO, sama dengan yang dipakai jastiper. */
export const fetchPartnerSubscriptionPaymentInfo = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { requirePartner } = await import('./partner-auth')
    await requirePartner()
    const { getSubscriptionSettings } = await import('./subscription-settings-queries')
    const settings = await getSubscriptionSettings()
    return {
      qrisImage: settings?.qrisImage ?? null,
      qrisString: settings?.qrisString ?? null,
      proPrice: settings?.proPrice ?? '0',
      originalPrice: settings?.originalPrice ?? null,
    }
  },
)

/** Status PRO partner: aktif atau tidak, pengajuan yang menunggu, dan riwayat. */
export const fetchPartnerSubscriptionState = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { requirePartner } = await import('./partner-auth')
    const partner = await requirePartner()
    const { db } = await import('../db')
    const { partnerSubscriptions } = await import('../db/schema')
    const rows = await db
      .select({
        id: partnerSubscriptions.id,
        status: partnerSubscriptions.status,
        startedAt: partnerSubscriptions.startedAt,
        endsAt: partnerSubscriptions.endsAt,
        amount: partnerSubscriptions.amount,
        createdAt: partnerSubscriptions.createdAt,
        reviewNote: partnerSubscriptions.reviewNote,
      })
      .from(partnerSubscriptions)
      .where(eq(partnerSubscriptions.partnerId, partner.id))
      .orderBy(desc(partnerSubscriptions.createdAt))
      .limit(20)

    const activeRows = rows.filter((r) => r.status === 'active')
    const latestActive = activeRows.reduce<Date | null>(
      (max, r) => (r.endsAt && (!max || r.endsAt > max) ? r.endsAt : max),
      null,
    )
    return {
      hasPro: hasPartnerPro(activeRows),
      proEndsAt: latestActive,
      pending: rows.find((r) => r.status === 'pending') ?? null,
      history: rows.slice(0, 10),
    }
  },
)

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { db } from '../db'
import { subscriptions } from '../db/schema'
import { getSessionUser } from './auth'
import { PRO_DURATION_DAYS, PRO_PLAN_CODE } from './subscription'
import { findPendingSubscription, getSubscriptionState } from './subscription-queries'

/**
 * Sisi MEMBER dari alur langganan PRO — pengajuan upgrade + baca status/riwayat
 * milik sendiri. Verifikasinya (approve/reject) ada di `src/lib/admin-functions.ts`.
 *
 * Bukti transfer disimpan sebagai base64 data URL langsung di kolom
 * `subscriptions.payment_proof_image` — pola yang sama dengan `qrisImage` di
 * `payment-methods-functions.ts` — karena belum ada object storage.
 */

const MAX_PROOF_BYTES = 1_500_000 // ~1.5MB, sama dengan validasi bukti QRIS

const paymentProofSchema = z
  .string()
  .refine((v) => /^data:image\/(png|jpe?g|webp);base64,/.test(v), {
    message: 'Format bukti transfer harus PNG, JPEG, atau WEBP',
  })
  .refine(
    (v) => {
      const base64 = v.split(',')[1] ?? ''
      return (base64.length * 3) / 4 <= MAX_PROOF_BYTES
    },
    { message: 'Ukuran bukti transfer maksimal 1.5MB' },
  )

const submitSubscriptionSchema = z.object({
  amount: z.number().positive('Nominal wajib diisi'),
  paymentMethod: z.enum(['bank', 'wallet', 'qris']),
  paymentProvider: z
    .string()
    .trim()
    .min(1, 'Bank/e-wallet wajib diisi')
    .max(40),
  paymentSenderName: z.string().trim().min(1, 'Nama pengirim wajib diisi').max(80),
  paymentReference: z.string().trim().max(60).optional(),
  paymentProofImage: paymentProofSchema,
  paymentNote: z.string().trim().max(500).optional(),
})

export const submitSubscriptionRequest = createServerFn({ method: 'POST' })
  .validator(submitSubscriptionSchema)
  .handler(async ({ data }) => {
    const user = await getSessionUser()
    if (!user) throw new Error('Belum login')

    // Jaring pengaman di level aplikasi — batas sebenarnya tetap dijaga unique
    // index `subscriptions_pending_per_user_unique` di DB.
    const existingPending = await findPendingSubscription(user.id)
    if (existingPending) {
      throw new Error('Kamu masih punya pengajuan yang menunggu verifikasi.')
    }

    const [request] = await db
      .insert(subscriptions)
      .values({
        userId: user.id,
        planCode: PRO_PLAN_CODE,
        status: 'pending',
        durationDays: PRO_DURATION_DAYS,
        amount: data.amount.toFixed(2),
        paymentMethod: data.paymentMethod,
        paymentProvider: data.paymentProvider,
        paymentSenderName: data.paymentSenderName,
        paymentReference: data.paymentReference || null,
        paymentProofImage: data.paymentProofImage,
        paymentNote: data.paymentNote || null,
        paidAt: new Date(),
      })
      .returning()

    return request
  })

/** Status akses + pengajuan pending + riwayat langganan milik user yang login. */
export const fetchMySubscriptionState = createServerFn({ method: 'GET' }).handler(
  async () => {
    const user = await getSessionUser()
    if (!user) throw new Error('Belum login')
    return getSubscriptionState(user)
  },
)
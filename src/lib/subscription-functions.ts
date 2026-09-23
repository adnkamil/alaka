import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { db } from '../db'
import { subscriptions } from '../db/schema'
import { getSessionUser } from './auth'
import { PRO_DURATION_DAYS, PRO_PLAN_CODE } from './subscription'
import { findPendingSubscription, getSubscriptionState } from './subscription-queries'
import { getSubscriptionSettings } from './subscription-settings-queries'

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
  paymentProofImage: paymentProofSchema,
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

    // Snapshot harga yang berlaku SAAT pengajuan dikirim — kalau admin ganti
    // harga besok, pengajuan yang sudah masuk hari ini tetap kepakai harga lama.
    const settings = await getSubscriptionSettings()

    const [request] = await db
      .insert(subscriptions)
      .values({
        userId: user.id,
        planCode: PRO_PLAN_CODE,
        status: 'pending',
        durationDays: PRO_DURATION_DAYS,
        amount: settings?.proPrice ?? '0',
        paymentMethod: 'qris',
        paymentProvider: 'QRIS',
        paymentProofImage: data.paymentProofImage,
        paidAt: new Date(),
      })
      .returning()

    return request
  })

/** QRIS + harga membership PRO buat ditampilkan di form pengajuan. */
export const fetchSubscriptionPaymentInfo = createServerFn({
  method: 'GET',
}).handler(async () => {
  const user = await getSessionUser()
  if (!user) throw new Error('Belum login')
  const settings = await getSubscriptionSettings()
  return {
    qrisImage: settings?.qrisImage ?? null,
    proPrice: settings?.proPrice ?? '0',
  }
})

/** Status akses + pengajuan pending + riwayat langganan milik user yang login. */
export const fetchMySubscriptionState = createServerFn({ method: 'GET' }).handler(
  async () => {
    const user = await getSessionUser()
    if (!user) throw new Error('Belum login')
    return getSubscriptionState(user)
  },
)
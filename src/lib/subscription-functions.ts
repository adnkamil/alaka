import { randomUUID } from 'node:crypto'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { db } from '../db'
import { subscriptions } from '../db/schema'
import { brandIdOf } from './brand'
import { getSessionUser } from './auth'
import { requireVerifiedEmail } from './email-verified'
import {
  PAYMENT_PROOF_MAX_DATA_URL_LENGTH,
  parsePaymentProofDataUrl,
  stripProofData,
} from './payment-proof'
import { deletePaymentProof, putPaymentProof } from './storage'
import { PRO_DURATION_DAYS, PRO_PLAN_CODE } from './subscription'
import {
  findPendingSubscription,
  getSubscriptionState,
} from './subscription-queries'
import { getSubscriptionSettings } from './subscription-settings-queries'

/**
 * Sisi MEMBER dari alur langganan PRO — pengajuan upgrade + baca status/riwayat
 * milik sendiri. Verifikasinya (approve/reject) ada di `src/lib/admin-functions.ts`.
 *
 * Bukti transfer disimpan di Netlify Blobs (lihat `storage.ts`, store
 * `payment-proofs`, key = id pengajuan) dan disajikan lewat route
 * `/api/subscription-proof/$id` yang wajib login. Kolom lama
 * `subscriptions.payment_proof_image` (base64) hanya tersisa untuk pengajuan
 * sebelum pindah ke Blobs.
 */

const submitSubscriptionSchema = z.object({
  // Panjang dibatasi dulu sebelum di-decode; tipe + isi file dicek ulang di
  // `parsePaymentProofDataUrl` (client tidak dipercaya).
  paymentProofImage: z
    .string()
    .max(
      PAYMENT_PROOF_MAX_DATA_URL_LENGTH,
      'Ukuran bukti transfer maksimal 1.5MB',
    ),
})

export const submitSubscriptionRequest = createServerFn({ method: 'POST' })
  .validator(submitSubscriptionSchema)
  .handler(async ({ data }) => {
    const user = await getSessionUser()
    if (!user) throw new Error('Belum login')
    // Pembayaran terkait identitas akun: email harus sudah terbukti milik user.
    requireVerifiedEmail(user)

    // Cek isi gambar dulu (tipe asli + ukuran) sebelum menyentuh storage.
    const proof = parsePaymentProofDataUrl(data.paymentProofImage)

    // Jaring pengaman di level aplikasi — batas sebenarnya tetap dijaga unique
    // index `subscriptions_pending_per_user_unique` di DB (per user; saat ada admin
    // di tahap berikutnya index itu diganti per brand).
    const existingPending = await findPendingSubscription(brandIdOf(user))
    if (existingPending) {
      throw new Error('Kamu masih punya pengajuan yang menunggu verifikasi.')
    }

    // Snapshot harga yang berlaku SAAT pengajuan dikirim — kalau admin ganti
    // harga besok, pengajuan yang sudah masuk hari ini tetap kepakai harga lama.
    const settings = await getSubscriptionSettings()

    // Id dibuat di sini karena jadi key file di Blobs. File disimpan DULU, baru
    // barisnya; kalau insert gagal (mis. kena unique index pending), file
    // dihapus lagi supaya tidak jadi file yatim.
    const id = randomUUID()
    await putPaymentProof(id, proof.bytes, proof.contentType)

    try {
      const [request] = await db
        .insert(subscriptions)
        .values({
          id,
          userId: user.id,
          brandId: brandIdOf(user),
          planCode: PRO_PLAN_CODE,
          status: 'pending',
          durationDays: PRO_DURATION_DAYS,
          amount: settings?.proPrice ?? '0',
          paymentMethod: 'qris',
          paymentProvider: 'QRIS',
          paymentProofStored: true,
          paidAt: new Date(),
        })
        .returning()

      return stripProofData(request)
    } catch (err) {
      try {
        await deletePaymentProof(id)
      } catch (cleanupErr) {
        console.error('Gagal membersihkan bukti transfer yatim:', cleanupErr)
      }
      throw err
    }
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
    qrisString: settings?.qrisString ?? null,
    proPrice: settings?.proPrice ?? '0',
  }
})

/** Status akses + pengajuan pending + riwayat langganan milik user yang login. */
export const fetchMySubscriptionState = createServerFn({
  method: 'GET',
}).handler(async () => {
  const user = await getSessionUser()
  if (!user) throw new Error('Belum login')
  return getSubscriptionState(user)
})

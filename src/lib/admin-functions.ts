import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db'
import { subscriptions } from '../db/schema'
import { requireAdminUser } from './admin'
import {
  findSubscriptionById,
  getAdminMetrics,
  listAdminSubscriptions,
} from './admin-queries'
import { nextProWindow } from './subscription'
import {
  SUBSCRIPTION_STATUSES,
  listActiveSubscriptions,
} from './subscription-queries'

export const fetchAdminMetrics = createServerFn({ method: 'GET' }).handler(
  async () => {
    await requireAdminUser()
    return getAdminMetrics()
  },
)

const listSchema = z
  .object({
    /** Kosongkan buat semua status ("Semua" tab di UI). */
    status: z.enum(SUBSCRIPTION_STATUSES).optional(),
  })
  .optional()

export const fetchAdminSubscriptions = createServerFn({ method: 'GET' })
  .validator(listSchema)
  .handler(async ({ data }) => {
    await requireAdminUser()
    return listAdminSubscriptions(data?.status)
  })

const reviewSchema = z.object({
  id: z.string().uuid(),
  note: z.string().trim().max(500).optional(),
})

/**
 * Setujui pengajuan PRO: hitung ulang jendela masa aktifnya lewat
 * `nextProWindow()` (SATU-SATUNYA tempat aturan "sambung sisa masa aktif"
 * ditulis — lihat `src/lib/subscription.ts`), lalu tandai baris ini `active`.
 */
export const approveSubscription = createServerFn({ method: 'POST' })
  .validator(reviewSchema)
  .handler(async ({ data }) => {
    const admin = await requireAdminUser()

    const sub = await findSubscriptionById(data.id)
    if (!sub) throw new Error('Pengajuan tidak ditemukan')
    if (sub.status !== 'pending') {
      throw new Error('Pengajuan ini sudah diproses sebelumnya')
    }

    const activeWindows = await listActiveSubscriptions(sub.userId)
    const { startedAt, endsAt } = nextProWindow(activeWindows, sub.durationDays)

    await db
      .update(subscriptions)
      .set({
        status: 'active',
        startedAt,
        endsAt,
        reviewedBy: admin.id,
        reviewedAt: new Date(),
        reviewNote: data.note?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, data.id))
  })

export const rejectSubscription = createServerFn({ method: 'POST' })
  .validator(reviewSchema)
  .handler(async ({ data }) => {
    const admin = await requireAdminUser()

    const sub = await findSubscriptionById(data.id)
    if (!sub) throw new Error('Pengajuan tidak ditemukan')
    if (sub.status !== 'pending') {
      throw new Error('Pengajuan ini sudah diproses sebelumnya')
    }

    await db
      .update(subscriptions)
      .set({
        status: 'rejected',
        reviewedBy: admin.id,
        reviewedAt: new Date(),
        reviewNote: data.note?.trim() || null,
        updatedAt: new Date(),
      })
      .where(eq(subscriptions.id, data.id))
  })

// ─────────────────────────────────────────────────────────────
// Tambahkan ke src/lib/admin-functions.ts — INI GANTI paste QRIS
// sebelumnya (kalau sudah kamu tempel), karena sekarang ada
// helper upsert bersama buat QRIS & harga.
// (pakai `requireAdminUser()`, `db`, `eq` yang sudah ada di file itu)
// ─────────────────────────────────────────────────────────────
import { subscriptionSettings } from '../db/schema'
import { getSubscriptionSettings } from './subscription-settings-queries'

const MAX_QRIS_BYTES = 1_500_000 // ~1.5MB, sama dengan validasi QRIS di payment-methods-functions.ts

const qrisImageSchema = z
  .string()
  .refine((v) => /^data:image\/(png|jpe?g|webp);base64,/.test(v), {
    message: 'Format QRIS harus PNG, JPEG, atau WEBP',
  })
  .refine(
    (v) => {
      const base64 = v.split(',')[1] ?? ''
      return (base64.length * 3) / 4 <= MAX_QRIS_BYTES
    },
    { message: 'Ukuran gambar QRIS maksimal 1.5MB' },
  )

/** Upsert baris singleton `subscription_settings` — dipakai QRIS & harga. */
async function upsertSubscriptionSettings(
  patch: Partial<{ qrisImage: string; proPrice: string }>,
  adminId: string,
) {
  const existing = await getSubscriptionSettings()

  if (existing) {
    await db
      .update(subscriptionSettings)
      .set({ ...patch, updatedAt: new Date(), updatedBy: adminId })
      .where(eq(subscriptionSettings.id, existing.id))
  } else {
    await db.insert(subscriptionSettings).values({ ...patch, updatedBy: adminId })
  }
}

/** Admin lihat pengaturan pembayaran PRO yang lagi aktif (QRIS + harga). */
export const fetchSubscriptionSettingsAdmin = createServerFn({
  method: 'GET',
}).handler(async () => {
  await requireAdminUser()
  return getSubscriptionSettings()
})

/** Admin upload/ganti QRIS pembayaran PRO. */
export const updateSubscriptionQris = createServerFn({ method: 'POST' })
  .validator(z.object({ qrisImage: qrisImageSchema }))
  .handler(async ({ data }) => {
    const admin = await requireAdminUser()
    await upsertSubscriptionSettings({ qrisImage: data.qrisImage }, admin.id)
    return { success: true }
  })

/** Admin atur harga membership PRO. Cuma berlaku buat pengajuan BARU. */
export const updateSubscriptionPrice = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      proPrice: z.number().nonnegative('Harga tidak boleh negatif'),
    }),
  )
  .handler(async ({ data }) => {
    const admin = await requireAdminUser()
    await upsertSubscriptionSettings(
      { proPrice: data.proPrice.toFixed(2) },
      admin.id,
    )
    return { success: true }
  })
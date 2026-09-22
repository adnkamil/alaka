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

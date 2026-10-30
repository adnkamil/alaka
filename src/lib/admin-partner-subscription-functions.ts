import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { nextProWindow } from './subscription'

/** Verifikasi langganan PRO partner oleh admin. */

const listSchema = z
  .object({ status: z.enum(['pending', 'active', 'rejected']).optional() })
  .optional()

export const fetchAdminPartnerSubscriptions = createServerFn({ method: 'GET' })
  .validator(listSchema)
  .handler(async ({ data }) => {
    await (await import('./admin')).requireAdminUser()
    const { db } = await import('../db')
    const { partnerSubscriptions, partners } = await import('../db/schema')
    const status = data?.status ?? 'pending'
    const rows = await db
      .select({
        id: partnerSubscriptions.id,
        partnerId: partnerSubscriptions.partnerId,
        partnerName: partners.name,
        status: partnerSubscriptions.status,
        amount: partnerSubscriptions.amount,
        createdAt: partnerSubscriptions.createdAt,
        startedAt: partnerSubscriptions.startedAt,
        endsAt: partnerSubscriptions.endsAt,
        reviewNote: partnerSubscriptions.reviewNote,
      })
      .from(partnerSubscriptions)
      .innerJoin(partners, eq(partners.id, partnerSubscriptions.partnerId))
      .where(eq(partnerSubscriptions.status, status))
      .orderBy(desc(partnerSubscriptions.createdAt))
      .limit(200)
    return rows
  })

const reviewSchema = z.object({
  id: z.uuid(),
  note: z.string().trim().max(500).optional(),
})

/**
 * Setujui pengajuan: masa aktif disambung dari langganan aktif partner itu
 * (aturan yang sama dengan jastiper, lewat nextProWindow).
 */
export const approvePartnerSubscription = createServerFn({ method: 'POST' })
  .validator(reviewSchema)
  .handler(async ({ data }) => {
    const admin = await (await import('./admin')).requireAdminUser()
    const { db } = await import('../db')
    const { partnerSubscriptions } = await import('../db/schema')

    const sub = await db.query.partnerSubscriptions.findFirst({
      where: eq(partnerSubscriptions.id, data.id),
    })
    if (!sub) throw new Error('Pengajuan tidak ditemukan')
    if (sub.status !== 'pending') throw new Error('Pengajuan ini sudah diproses sebelumnya')

    const activeRows = await db
      .select({
        status: partnerSubscriptions.status,
        startedAt: partnerSubscriptions.startedAt,
        endsAt: partnerSubscriptions.endsAt,
      })
      .from(partnerSubscriptions)
      .where(
        and(
          eq(partnerSubscriptions.partnerId, sub.partnerId),
          eq(partnerSubscriptions.status, 'active'),
        ),
      )
    const { startedAt, endsAt } = nextProWindow(activeRows, sub.durationDays)

    await db
      .update(partnerSubscriptions)
      .set({
        status: 'active',
        startedAt,
        endsAt,
        reviewedBy: admin.id,
        reviewedAt: new Date(),
        reviewNote: data.note?.trim() || null,
        updatedAt: new Date(),
      })
      .where(and(eq(partnerSubscriptions.id, data.id), eq(partnerSubscriptions.status, 'pending')))
    return { ok: true as const }
  })

export const rejectPartnerSubscription = createServerFn({ method: 'POST' })
  .validator(reviewSchema)
  .handler(async ({ data }) => {
    const admin = await (await import('./admin')).requireAdminUser()
    const { db } = await import('../db')
    const { partnerSubscriptions } = await import('../db/schema')
    const updated = await db
      .update(partnerSubscriptions)
      .set({
        status: 'rejected',
        reviewedBy: admin.id,
        reviewedAt: new Date(),
        reviewNote: data.note?.trim() || null,
        updatedAt: new Date(),
      })
      .where(and(eq(partnerSubscriptions.id, data.id), eq(partnerSubscriptions.status, 'pending')))
      .returning({ id: partnerSubscriptions.id })
    if (updated.length === 0) throw new Error('Pengajuan tidak ditemukan atau sudah diproses')
    return { ok: true as const }
  })

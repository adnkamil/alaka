import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requirePartner } from './partner-auth'

/**
 * Notifikasi Partner Portal (lonceng): daftar, jumlah belum dibaca, dan tanda
 * dibaca. Semua dibatasi ke partner yang login. Handler memakai import dinamis
 * supaya `db` tidak ikut ke bundle client.
 */

export type PartnerNotificationItem = {
  id: string
  kind: string
  title: string
  body: string | null
  link: string | null
  createdAt: string
  isRead: boolean
}

/** 50 notifikasi terbaru partner yang login. */
export const fetchPartnerNotifications = createServerFn({
  method: 'GET',
}).handler(async (): Promise<Array<PartnerNotificationItem>> => {
  const partner = await requirePartner()
  const { db } = await import('../db')
  const { desc, eq } = await import('drizzle-orm')
  const { partnerNotifications } = await import('../db/schema')
  const rows = await db
    .select()
    .from(partnerNotifications)
    .where(eq(partnerNotifications.partnerId, partner.id))
    .orderBy(desc(partnerNotifications.createdAt))
    .limit(50)
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    link: r.link,
    createdAt: r.createdAt.toISOString(),
    isRead: r.readAt !== null,
  }))
})

/** Jumlah notifikasi belum dibaca (badge lonceng). */
export const fetchPartnerUnreadCount = createServerFn({
  method: 'GET',
}).handler(async () => {
  const partner = await requirePartner()
  const { db } = await import('../db')
  const { and, eq, isNull, sql } = await import('drizzle-orm')
  const { partnerNotifications } = await import('../db/schema')
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(partnerNotifications)
    .where(
      and(
        eq(partnerNotifications.partnerId, partner.id),
        isNull(partnerNotifications.readAt),
      ),
    )
  return { count: row.count }
})

/** Tandai semua notifikasi partner ini sudah dibaca. */
export const markAllPartnerNotificationsRead = createServerFn({
  method: 'POST',
}).handler(async () => {
  const partner = await requirePartner()
  const { db } = await import('../db')
  const { and, eq, isNull } = await import('drizzle-orm')
  const { partnerNotifications } = await import('../db/schema')
  await db
    .update(partnerNotifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(partnerNotifications.partnerId, partner.id),
        isNull(partnerNotifications.readAt),
      ),
    )
  return { ok: true as const }
})

/** Tandai satu notifikasi dibaca (saat diklik). */
export const markPartnerNotificationRead = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const partner = await requirePartner()
    const { db } = await import('../db')
    const { and, eq, isNull } = await import('drizzle-orm')
    const { partnerNotifications } = await import('../db/schema')
    await db
      .update(partnerNotifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(partnerNotifications.id, data.id),
          eq(partnerNotifications.partnerId, partner.id),
          isNull(partnerNotifications.readAt),
        ),
      )
    return { ok: true as const }
  })

import { createServerFn } from '@tanstack/react-start'
import { and, desc, eq, isNull, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db'
import { notificationReads, notifications } from '../db/schema'
import { getSessionUser } from './auth'
import { brandIdOf } from './brand'
import { requireAdminUser } from './admin'

async function requireUser() {
  const user = await getSessionUser()
  if (!user) throw new Error('Belum login')
  return user
}

export const NOTIFICATION_TARGETS = [
  'none',
  'beranda',
  'kalender',
  'keuangan',
  'profil',
] as const

export type NotificationTarget = (typeof NOTIFICATION_TARGETS)[number]

export type NotificationItem = {
  id: string
  kind: string
  title: string
  body: string | null
  target: NotificationTarget
  calendarEventId: string | null
  createdAt: string
  isRead: boolean
}

/** Notifikasi yang boleh dilihat brand ini: broadcast (null) atau khusus brandnya. */
function visibleTo(brandId: string) {
  return or(isNull(notifications.brandId), eq(notifications.brandId, brandId))
}

function asTarget(value: string): NotificationTarget {
  return (NOTIFICATION_TARGETS as ReadonlyArray<string>).includes(value)
    ? (value as NotificationTarget)
    : 'none'
}

/** Daftar notifikasi terbaru (maks 50) untuk brand user yang login. */
export const fetchNotifications = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Array<NotificationItem>> => {
    const user = await requireUser()
    const rows = await db
      .select({
        id: notifications.id,
        kind: notifications.kind,
        title: notifications.title,
        body: notifications.body,
        target: notifications.target,
        calendarEventId: notifications.calendarEventId,
        createdAt: notifications.createdAt,
        readAt: notificationReads.readAt,
      })
      .from(notifications)
      .leftJoin(
        notificationReads,
        and(
          eq(notificationReads.notificationId, notifications.id),
          eq(notificationReads.userId, user.id),
        ),
      )
      .where(visibleTo(brandIdOf(user)))
      .orderBy(desc(notifications.createdAt))
      .limit(50)

    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      body: r.body,
      target: asTarget(r.target),
      calendarEventId: r.calendarEventId,
      createdAt: r.createdAt.toISOString(),
      isRead: r.readAt !== null,
    }))
  },
)

/** Jumlah notifikasi yang belum dibaca user ini (untuk badge lonceng). */
export const fetchUnreadNotificationCount = createServerFn({
  method: 'GET',
}).handler(async () => {
  const user = await requireUser()
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .leftJoin(
      notificationReads,
      and(
        eq(notificationReads.notificationId, notifications.id),
        eq(notificationReads.userId, user.id),
      ),
    )
    .where(and(visibleTo(brandIdOf(user)), isNull(notificationReads.readAt)))
  return { count: row.count }
})

/** Tandai semua notifikasi yang terlihat oleh user sebagai sudah dibaca. */
export const markAllNotificationsRead = createServerFn({
  method: 'POST',
}).handler(async () => {
  const user = await requireUser()
  const brandId = brandIdOf(user)
  await db.execute(sql`
    insert into notification_reads (user_id, notification_id)
    select ${user.id}::uuid, n.id
    from notifications n
    where n.brand_id is null or n.brand_id = ${brandId}::uuid
    on conflict do nothing
  `)
  return { ok: true as const }
})

/** Admin ALAKA mengirim info (fitur baru, promo) ke semua brand jastiper. */
export const sendAlakaNotification = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      title: z.string().trim().min(1).max(120),
      body: z.string().trim().max(500).optional(),
      target: z.enum(NOTIFICATION_TARGETS).default('none'),
    }),
  )
  .handler(async ({ data }) => {
    await requireAdminUser()
    await db.insert(notifications).values({
      brandId: null,
      kind: 'info_alaka',
      title: data.title,
      body: data.body || null,
      target: data.target,
    })
    return { ok: true as const }
  })

/** Riwayat info yang pernah dikirim admin ALAKA (untuk halaman admin). */
export const listAlakaNotifications = createServerFn({ method: 'GET' }).handler(
  async () => {
    await requireAdminUser()
    const rows = await db
      .select({
        id: notifications.id,
        title: notifications.title,
        body: notifications.body,
        target: notifications.target,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(
        and(
          eq(notifications.kind, 'info_alaka'),
          isNull(notifications.brandId),
        ),
      )
      .orderBy(desc(notifications.createdAt))
      .limit(30)
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      body: r.body,
      target: asTarget(r.target),
      createdAt: r.createdAt.toISOString(),
    }))
  },
)

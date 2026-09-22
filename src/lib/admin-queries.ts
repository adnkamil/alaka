import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { db } from '../db'
import { sessions, subscriptions, users } from '../db/schema'
import type { SubscriptionStatus } from './subscription'

/**
 * Akses data admin (server-side), sama polanya dengan `subscription-queries.ts`:
 * fungsi murni tanpa `createServerFn` — pagar admin & validasi input ada di
 * `src/lib/admin-functions.ts`, file ini cuma query.
 */

export type AdminSubscriptionRow = typeof subscriptions.$inferSelect & {
  userName: string
  userEmail: string
  userBrandName: string | null
}

/** Histori pengajuan/pembelian PRO LINTAS SEMUA USER, terbaru dulu. */
export async function listAdminSubscriptions(
  status?: SubscriptionStatus,
): Promise<Array<AdminSubscriptionRow>> {
  const rows = await db
    .select({
      subscription: subscriptions,
      userName: users.name,
      userEmail: users.email,
      userBrandName: users.brandName,
    })
    .from(subscriptions)
    .innerJoin(users, eq(subscriptions.userId, users.id))
    .where(status ? eq(subscriptions.status, status) : undefined)
    .orderBy(desc(subscriptions.createdAt), desc(subscriptions.id))

  return rows.map(({ subscription, userName, userEmail, userBrandName }) => ({
    ...subscription,
    userName,
    userEmail,
    userBrandName,
  }))
}

/** Satu pengajuan by id, tanpa filter kepemilikan (admin boleh lihat punya siapa saja). */
export async function findSubscriptionById(id: string) {
  return db.query.subscriptions.findFirst({
    where: eq(subscriptions.id, id),
  })
}

export interface AdminMetrics {
  totalUsers: number
  /** User dengan sesi login baru dalam `ACTIVE_USER_WINDOW_DAYS` hari terakhir. */
  activeUsers: number
  /** Subscription `active` yang `ends_at`-nya belum lewat (bukan cuma cek status). */
  proActive: number
  proPending: number
  /** Total `amount` dari semua pengajuan yang PERNAH disetujui admin (active + expired). */
  proRevenue: number
}

const ACTIVE_USER_WINDOW_DAYS = 14

/**
 * Metrik ringkas buat dashboard admin.
 *
 * CATATAN soal `activeUsers`: dihitung dari baris `sessions` baru (login)
 * dalam 14 hari terakhir — BUKAN dari tabel `activity_logs`. `activity_logs`
 * sudah ada di schema untuk tracking per-aksi yang lebih presisi, tapi belum
 * ada satu pun kode yang menulis ke sana, jadi kalau dipakai sekarang
 * hasilnya akan selalu 0. Proxy login ini gampang diganti begitu
 * `activity_logs` mulai diisi.
 */
export async function getAdminMetrics(
  now: Date = new Date(),
): Promise<AdminMetrics> {
  const activeSince = new Date(
    now.getTime() - ACTIVE_USER_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  )

  const [
    [totalUsersRow],
    [activeUsersRow],
    [proActiveRow],
    [proPendingRow],
    [revenueRow],
  ] = await Promise.all([
    db.select({ value: sql<string>`count(*)` }).from(users),
    db
      .select({ value: sql<string>`count(distinct ${sessions.userId})` })
      .from(sessions)
      .where(gte(sessions.createdAt, activeSince)),
    db
      .select({ value: sql<string>`count(*)` })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.status, 'active'),
          sql`${subscriptions.endsAt} > ${now}`,
        ),
      ),
    db
      .select({ value: sql<string>`count(*)` })
      .from(subscriptions)
      .where(eq(subscriptions.status, 'pending')),
    db
      .select({ value: sql<string>`coalesce(sum(${subscriptions.amount}), 0)` })
      .from(subscriptions)
      .where(sql`${subscriptions.status} in ('active', 'expired')`),
  ])

  return {
    totalUsers: Number(totalUsersRow.value),
    activeUsers: Number(activeUsersRow.value),
    proActive: Number(proActiveRow.value),
    proPending: Number(proPendingRow.value),
    proRevenue: Number(revenueRow.value),
  }
}

import { and, desc, eq, gte, max, sql } from 'drizzle-orm'
import { db } from '../db'
import { sessions, subscriptions, users } from '../db/schema'
import { resolveEntitlement } from './subscription'
import type {
  PlanKey,
  SubscriptionStatus,
  SubscriptionWindow,
} from './subscription'

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
    .where(
      and(
        status ? eq(subscriptions.status, status) : undefined,
        eq(users.isAdmin, false),
      ),
    )
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
  /**
   * Jendela hari yang dipakai `activeUsers` — ikut dikirim ke client supaya
   * hint kartu ("Login N hari terakhir") dihitung dari nilai yang sama, bukan
   * angka yang ditulis ulang di halaman.
   */
  activeWindowDays: number
  /** Subscription `active` yang `ends_at`-nya belum lewat (bukan cuma cek status). */
  proActive: number
  proPending: number
  /** Total `amount` dari semua pengajuan yang PERNAH disetujui admin (active + expired). */
  proRevenue: number
}

const ACTIVE_USER_WINDOW_DAYS = 7

/**
 * Metrik ringkas buat dashboard admin.
 *
 * CATATAN soal `activeUsers`: dihitung dari baris `sessions` baru (login)
 * dalam `ACTIVE_USER_WINDOW_DAYS` hari terakhir — BUKAN dari tabel
 * `activity_logs`. `activity_logs` sudah ada di schema untuk tracking per-aksi
 * yang lebih presisi, tapi belum ada satu pun kode yang menulis ke sana, jadi
 * kalau dipakai sekarang hasilnya akan selalu 0. Proxy login ini gampang
 * diganti begitu `activity_logs` mulai diisi.
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
    db
      .select({ value: sql<string>`count(*)` })
      .from(users)
      .where(eq(users.isAdmin, false)),
    db
      .select({ value: sql<string>`count(distinct ${sessions.userId})` })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(
        and(gte(sessions.createdAt, activeSince), eq(users.isAdmin, false)),
      ),
    db
      .select({ value: sql<string>`count(*)` })
      .from(subscriptions)
      .innerJoin(users, eq(subscriptions.userId, users.id))
      .where(
        and(
          eq(subscriptions.status, 'active'),
          sql`${subscriptions.endsAt} > ${now}`,
          eq(users.isAdmin, false),
        ),
      ),
    db
      .select({ value: sql<string>`count(*)` })
      .from(subscriptions)
      .innerJoin(users, eq(subscriptions.userId, users.id))
      .where(
        and(eq(subscriptions.status, 'pending'), eq(users.isAdmin, false)),
      ),
    db
      .select({ value: sql<string>`coalesce(sum(${subscriptions.amount}), 0)` })
      .from(subscriptions)
      .innerJoin(users, eq(subscriptions.userId, users.id))
      .where(
        and(
          sql`${subscriptions.status} in ('active', 'expired')`,
          eq(users.isAdmin, false),
        ),
      ),
  ])

  return {
    totalUsers: Number(totalUsersRow.value),
    activeUsers: Number(activeUsersRow.value),
    activeWindowDays: ACTIVE_USER_WINDOW_DAYS,
    proActive: Number(proActiveRow.value),
    proPending: Number(proPendingRow.value),
    proRevenue: Number(revenueRow.value),
  }
}

export interface AdminUserRow {
  id: string
  name: string
  email: string
  brandName: string | null
  isAdmin: boolean
  /** Tanggal daftar (buat urutan & kolom "Terdaftar"). */
  createdAt: Date
  /** Plan hasil `resolveEntitlement()`: `pro`, `trial`, atau `free`. */
  plan: PlanKey
  /** Akhir masa PRO — cuma terisi kalau `plan === 'pro'` (lihat "Aktif sampai"). */
  proUntil: Date | null
  /** Ada pengajuan upgrade yang masih menunggu verifikasi admin. */
  hasPending: boolean
  /** Login terakhir (baris `sessions` terbaru). `null` kalau belum pernah login. */
  lastLoginAt: Date | null
  /** Login dalam `ACTIVE_USER_WINDOW_DAYS` hari terakhir — definisi sama dengan metrik "Active Users". */
  isActive: boolean
  /** `SUM(amount)` pengajuan yang PERNAH disetujui (active + expired) — sama dengan metrik "PRO Revenue". */
  revenue: number
}

/**
 * Semua user (customer aplikasi) + status langganan, aktivitas login, dan total
 * revenue — dipakai halaman Customer admin (`/admin/customers`).
 *
 * Status plan sengaja dihitung lewat `resolveEntitlement()` — satu-satunya
 * tempat aturan PRO/trial/FREE ditulis — bukan dicek ulang di query. Datanya
 * diambil dengan query agregat terpisah lalu digabung di memori: jumlah baris
 * `subscriptions` & `sessions` per user kecil, dan cara ini menghindari join
 * yang bikin baris user terduplikasi (harga bayar: satu peta per metrik).
 */
export async function listAdminUsers(
  now: Date = new Date(),
): Promise<Array<AdminUserRow>> {
  const activeSince = new Date(
    now.getTime() - ACTIVE_USER_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  )

  const [userRows, activeRows, pendingRows, revenueRows, lastLoginRows] =
    await Promise.all([
      db
        .select()
        .from(users)
        .where(eq(users.isAdmin, false))
        .orderBy(desc(users.createdAt), desc(users.id)),
      // Cuma baris yang masa berlakunya belum lewat; `resolveEntitlement()`
      // tetap penentu akhir lewat `ends_at` (pola sama dengan metrik PRO Active).
      db
        .select({
          userId: subscriptions.userId,
          status: subscriptions.status,
          startedAt: subscriptions.startedAt,
          endsAt: subscriptions.endsAt,
        })
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.status, 'active'),
            sql`${subscriptions.endsAt} > ${now}`,
          ),
        ),
      db
        .select({ userId: subscriptions.userId })
        .from(subscriptions)
        .where(eq(subscriptions.status, 'pending')),
      db
        .select({
          userId: subscriptions.userId,
          total: sql<string>`coalesce(sum(${subscriptions.amount}), 0)`,
        })
        .from(subscriptions)
        .where(sql`${subscriptions.status} in ('active', 'expired')`)
        .groupBy(subscriptions.userId),
      // `group by` bikin user yang belum pernah login tidak muncul di hasil —
      // itu memang yang diinginkan (`lastLoginAt` jadi null). Pakai helper
      // `max()` dari drizzle (bukan `sql` mentah) supaya hasilnya dipetakan
      // lewat tipe kolomnya: driver mengembalikan timestamp sebagai string, dan
      // mapping itu yang mengubahnya jadi Date — sama seperti `users.createdAt`.
      db
        .select({
          userId: sessions.userId,
          lastLoginAt: max(sessions.createdAt),
        })
        .from(sessions)
        .groupBy(sessions.userId),
    ])

  const windowsByUser = new Map<string, Array<SubscriptionWindow>>()
  for (const row of activeRows) {
    const windows = windowsByUser.get(row.userId) ?? []
    windows.push({
      status: row.status,
      startedAt: row.startedAt,
      endsAt: row.endsAt,
    })
    windowsByUser.set(row.userId, windows)
  }

  const pendingUserIds = new Set(pendingRows.map((row) => row.userId))
  const revenueByUser = new Map<string, number>(
    revenueRows.map((row) => [row.userId, Number(row.total)]),
  )
  const lastLoginByUser = new Map<string, Date | null>(
    lastLoginRows.map((row) => [row.userId, row.lastLoginAt]),
  )

  return userRows.map((user) => {
    const entitlement = resolveEntitlement(
      {
        trialStartedAt: user.trialStartedAt,
        trialEndsAt: user.trialEndsAt,
        subscriptions: windowsByUser.get(user.id) ?? [],
      },
      now,
    )
    const lastLoginAt = lastLoginByUser.get(user.id) ?? null

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      brandName: user.brandName,
      isAdmin: user.isAdmin,
      createdAt: user.createdAt,
      plan: entitlement.plan,
      proUntil: entitlement.proUntil,
      hasPending: pendingUserIds.has(user.id),
      lastLoginAt,
      isActive:
        lastLoginAt !== null && lastLoginAt.getTime() >= activeSince.getTime(),
      revenue: revenueByUser.get(user.id) ?? 0,
    }
  })
}

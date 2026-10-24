import { and, desc, eq, gte, max, sql } from 'drizzle-orm'
import { db } from '../db'
import { brands, events, orders, subscriptions, users } from '../db/schema'
import { applyBrandIdentity } from './brand'
import { stripProofData } from './payment-proof'
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

// Tanpa isi bukti transfer (base64): admin memuat gambarnya lewat
// `paymentProofUrl(id)` hanya saat menekan "Lihat bukti transfer".
export type AdminSubscriptionRow = ReturnType<
  typeof stripProofData<typeof subscriptions.$inferSelect>
> & {
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
      userBrandName: brands.name,
    })
    .from(subscriptions)
    .innerJoin(users, eq(subscriptions.userId, users.id))
    .innerJoin(brands, eq(users.brandId, brands.id))
    .where(
      and(
        status ? eq(subscriptions.status, status) : undefined,
        eq(users.isAdmin, false),
      ),
    )
    .orderBy(desc(subscriptions.createdAt), desc(subscriptions.id))

  return rows.map(({ subscription, userName, userEmail, userBrandName }) => ({
    ...stripProofData(subscription),
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
  /** Brand yang membuat/mengubah pesanan dalam `ACTIVE_USER_WINDOW_DAYS` hari terakhir. */
  activeUsers: number
  /**
   * Jendela hari yang dipakai `activeUsers` — ikut dikirim ke client supaya
   * hint kartu ("Aktivitas pesanan N hari terakhir") dihitung dari nilai yang sama, bukan
   * angka yang ditulis ulang di halaman.
   */
  activeWindowDays: number
  /** Subscription `active` yang `ends_at`-nya belum lewat (bukan cuma cek status). */
  proActive: number
  proPending: number
  /**
   * User yang sedang dalam masa trial: `trial_ends_at` belum lewat dan TIDAK
   * punya PRO aktif (urutan prioritas sama dengan `resolveEntitlement()`:
   * PRO > TRIAL > FREE).
   */
  trialUsers: number
  /** Total `amount` dari semua pengajuan yang PERNAH disetujui admin (active + expired). */
  proRevenue: number
}

const ACTIVE_USER_WINDOW_DAYS = 7

/**
 * Metrik ringkas buat dashboard admin.
 *
 * CATATAN soal `activeUsers`: "aktivitas" = MEMBUAT atau MENGUBAH pesanan,
 * dibaca dari `orders.updated_at` (terisi saat insert dan di-set ulang di
 * setiap update pesanan/status bayar/impor) lewat `events.brand_id`. Dihitung
 * dalam `ACTIVE_USER_WINDOW_DAYS` hari terakhir — BUKAN dari tabel
 * `activity_logs`: tabel itu sudah ada di schema untuk tracking per-aksi yang
 * lebih presisi, tapi belum ada satu pun kode yang menulis ke sana, jadi kalau
 * dipakai sekarang hasilnya akan selalu 0. Definisi ini gampang diganti begitu
 * `activity_logs` mulai diisi. Catatan: mencentang checklist belanja
 * (`items.obtained`) dan menghapus barang tidak menyentuh `orders.updated_at`,
 * jadi belum terhitung sebagai aktivitas.
 */
/** Join ke akun PEMILIK sebuah brand (tepat satu per brand). */
function ownerOf(
  brandId: typeof subscriptions.brandId | typeof events.brandId,
) {
  return and(eq(users.brandId, brandId), eq(users.brandRole, 'owner'))
}

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
    [trialUsersRow],
    [revenueRow],
  ] = await Promise.all([
    // "User" di dasbor = BRAND (diwakili akun pemilik). Akun admin brand tidak
    // dihitung sendiri, supaya satu brand tidak terhitung dua kali.
    db
      .select({ value: sql<string>`count(*)` })
      .from(users)
      .where(and(eq(users.isAdmin, false), eq(users.brandRole, 'owner'))),
    // Brand aktif = ada pesanan yang dibuat/diubah dalam jendela waktu
    // (oleh pemilik ATAU admin brand — pesanan milik brand, bukan akun).
    db
      .select({ value: sql<string>`count(distinct ${events.brandId})` })
      .from(orders)
      .innerJoin(events, eq(orders.eventId, events.id))
      .innerJoin(users, ownerOf(events.brandId))
      .where(and(gte(orders.updatedAt, activeSince), eq(users.isAdmin, false))),
    // Langganan milik brand: ikuti `subscriptions.brandId` ke akun pemilik
    // (pengaju bisa kosong kalau akunnya sudah dihapus).
    db
      .select({ value: sql<string>`count(*)` })
      .from(subscriptions)
      .innerJoin(users, ownerOf(subscriptions.brandId))
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
      .innerJoin(users, ownerOf(subscriptions.brandId))
      .where(
        and(eq(subscriptions.status, 'pending'), eq(users.isAdmin, false)),
      ),
    db
      .select({ value: sql<string>`count(*)` })
      .from(users)
      .innerJoin(brands, eq(users.brandId, brands.id))
      .where(
        and(
          eq(users.isAdmin, false),
          eq(users.brandRole, 'owner'),
          sql`${brands.trialEndsAt} > ${now}`,
          sql`not exists (
            select 1 from ${subscriptions}
            where ${subscriptions.brandId} = ${users.brandId}
              and ${subscriptions.status} = 'active'
              and ${subscriptions.endsAt} > ${now}
          )`,
        ),
      ),
    db
      .select({ value: sql<string>`coalesce(sum(${subscriptions.amount}), 0)` })
      .from(subscriptions)
      .innerJoin(users, ownerOf(subscriptions.brandId))
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
    trialUsers: Number(trialUsersRow.value),
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
  /** Jumlah akun admin di brand ini (selain pemilik). */
  adminCount: number
  /** Aktivitas terakhir = pesanan terakhir dibuat/diubah (`max(orders.updated_at)`). `null` kalau belum pernah. */
  lastActivityAt: Date | null
  /** Ada aktivitas dalam `ACTIVE_USER_WINDOW_DAYS` hari terakhir — definisi sama dengan metrik "Active Users". */
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

  // Satu baris = satu BRAND (akun pemilik). Admin brand tidak punya baris
  // sendiri; jumlahnya ditampilkan di baris brand-nya (`adminCount`).
  const [
    userRows,
    activeRows,
    pendingRows,
    revenueRows,
    lastActivityRows,
    adminRows,
  ] = await Promise.all([
    db
      .select({ user: users, brand: brands })
      .from(users)
      .innerJoin(brands, eq(users.brandId, brands.id))
      .where(and(eq(users.isAdmin, false), eq(users.brandRole, 'owner')))
      .orderBy(desc(users.createdAt), desc(users.id)),
    // Cuma baris yang masa berlakunya belum lewat; `resolveEntitlement()`
    // tetap penentu akhir lewat `ends_at` (pola sama dengan metrik PRO Active).
    db
      .select({
        brandId: subscriptions.brandId,
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
      .select({ brandId: subscriptions.brandId })
      .from(subscriptions)
      .where(eq(subscriptions.status, 'pending')),
    db
      .select({
        brandId: subscriptions.brandId,
        total: sql<string>`coalesce(sum(${subscriptions.amount}), 0)`,
      })
      .from(subscriptions)
      .where(sql`${subscriptions.status} in ('active', 'expired')`)
      .groupBy(subscriptions.brandId),
    // `group by` bikin brand yang belum punya pesanan tidak muncul di hasil —
    // itu memang yang diinginkan (`lastActivityAt` jadi null). Pakai helper
    // `max()` dari drizzle (bukan `sql` mentah) supaya hasilnya dipetakan
    // lewat tipe kolomnya: driver mengembalikan timestamp sebagai string, dan
    // mapping itu yang mengubahnya jadi Date — sama seperti `users.createdAt`.
    // Aktivitas terakhir BRAND = pesanan terakhir dibuat/diubah di event mana
    // pun milik brand itu (`orders.updated_at` terisi saat insert).
    db
      .select({
        brandId: events.brandId,
        lastActivityAt: max(orders.updatedAt),
      })
      .from(orders)
      .innerJoin(events, eq(orders.eventId, events.id))
      .groupBy(events.brandId),
    db
      .select({
        brandId: users.brandId,
        total: sql<string>`count(*)::int`,
      })
      .from(users)
      .where(eq(users.brandRole, 'admin'))
      .groupBy(users.brandId),
  ])

  const windowsByBrand = new Map<string, Array<SubscriptionWindow>>()
  for (const row of activeRows) {
    const windows = windowsByBrand.get(row.brandId) ?? []
    windows.push({
      status: row.status,
      startedAt: row.startedAt,
      endsAt: row.endsAt,
    })
    windowsByBrand.set(row.brandId, windows)
  }

  const pendingBrandIds = new Set(pendingRows.map((row) => row.brandId))
  const revenueByBrand = new Map<string, number>(
    revenueRows.map((row) => [row.brandId, Number(row.total)]),
  )
  const lastActivityByBrand = new Map<string, Date | null>(
    lastActivityRows.map((row) => [row.brandId, row.lastActivityAt]),
  )
  const adminCountByBrand = new Map<string, number>(
    adminRows.map((row) => [row.brandId, Number(row.total)]),
  )

  return userRows.map(({ user: userRow, brand }) => {
    const user = applyBrandIdentity(userRow, brand)
    const entitlement = resolveEntitlement(
      {
        trialStartedAt: user.trialStartedAt,
        trialEndsAt: user.trialEndsAt,
        subscriptions: windowsByBrand.get(user.brandId) ?? [],
      },
      now,
    )
    const lastActivityAt = lastActivityByBrand.get(user.brandId) ?? null

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      brandName: user.brandName,
      isAdmin: user.isAdmin,
      createdAt: user.createdAt,
      plan: entitlement.plan,
      proUntil: entitlement.proUntil,
      hasPending: pendingBrandIds.has(user.brandId),
      adminCount: adminCountByBrand.get(user.brandId) ?? 0,
      lastActivityAt,
      isActive:
        lastActivityAt !== null &&
        lastActivityAt.getTime() >= activeSince.getTime(),
      revenue: revenueByBrand.get(user.brandId) ?? 0,
    }
  })
}

import { and, desc, eq } from 'drizzle-orm'
import { db } from '../db'
import { subscriptions } from '../db/schema'
import { brandIdOf } from './brand'
import { stripProofData } from './payment-proof'
import { resolveEntitlement } from './subscription'
import type { users } from '../db/schema'
import type { Entitlement, SubscriptionStatus } from './subscription'

/**
 * Akses data langganan (server-side) — query murni tanpa `createServerFn`,
 * sama polanya dengan `admin-queries.ts` & `customers-queries.ts`.
 *
 * Dipakai oleh `entitlements.ts` (hitung status akses), `subscription-functions.ts`
 * (sisi member: pengajuan upgrade + baca status sendiri), dan `admin-functions.ts`
 * (sisi admin: approve/reject). Client tidak boleh meng-import file ini karena
 * `db` ada di level modul — lihat `client-bundle-safety.test.ts`.
 */

/** Baris `subscriptions` apa adanya (sesuai tabel). */
export type SubscriptionRow = typeof subscriptions.$inferSelect

/** Kolom `users` yang dibutuhkan buat hitung status akses. */
export type TrialFields = Pick<
  typeof users.$inferSelect,
  'id' | 'brandId' | 'trialStartedAt' | 'trialEndsAt'
>

/**
 * Baris langganan versi yang aman dikirim ke browser: tanpa isi bukti transfer
 * (base64), diganti penanda `hasPaymentProof`. Gambarnya dimuat lewat
 * `paymentProofUrl(id)` (route `/api/subscription-proof/$id`, wajib login).
 */
export type ClientSubscription = ReturnType<
  typeof stripProofData<SubscriptionRow>
>

export interface SubscriptionState {
  entitlement: Entitlement
  /** Semua histori langganan user, terbaru dulu. */
  subscriptions: Array<ClientSubscription>
  /** Pengajuan yang menunggu verifikasi admin, kalau ada. */
  pending: ClientSubscription | null
}

/** Histori langganan milik satu brand (terbaru dulu). */
export async function listSubscriptions(brandId: string) {
  return (
    db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.brandId, brandId))
      // id sebagai tiebreaker supaya urutan stabil kalau created_at sama persis.
      .orderBy(desc(subscriptions.createdAt), desc(subscriptions.id))
  )
}

/** Pengajuan yang masih menunggu verifikasi admin (maks. satu per brand). */
export async function findPendingSubscription(brandId: string) {
  return db.query.subscriptions.findFirst({
    where: and(
      eq(subscriptions.brandId, brandId),
      eq(subscriptions.status, 'pending'),
    ),
    orderBy: [desc(subscriptions.createdAt), desc(subscriptions.id)],
  })
}

/**
 * Baris `active` milik brand (termasuk yang masa berlakunya sudah lewat).
 * Dipakai buat hitung entitlement: mana yang benar-benar masih berlaku
 * ditentukan oleh `resolveEntitlement()` lewat `ends_at`, jadi query-nya nggak
 * perlu ikut menghitung tanggal.
 */
export async function listActiveSubscriptions(brandId: string) {
  return db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.brandId, brandId),
        eq(subscriptions.status, 'active'),
      ),
    )
    .orderBy(desc(subscriptions.endsAt), desc(subscriptions.id))
}

/**
 * Status akses user sekarang: TRIAL / FREE / PRO + histori & pengajuan yang
 * menggantung. Ini pengganti `users.is_pro`: statusnya selalu dihitung ulang
 * dari kolom trial di `users` + baris `subscriptions`.
 */
export async function getSubscriptionState(
  user: TrialFields,
  now: Date = new Date(),
): Promise<SubscriptionState> {
  const rows = await listSubscriptions(brandIdOf(user))
  const pendingRow = rows.find((row) => row.status === 'pending')

  return {
    entitlement: resolveEntitlement(
      {
        trialStartedAt: user.trialStartedAt,
        trialEndsAt: user.trialEndsAt,
        subscriptions: rows,
      },
      now,
    ),
    subscriptions: rows.map(stripProofData),
    pending: pendingRow ? stripProofData(pendingRow) : null,
  }
}

/** Ambil satu baris subscription dengan pengaman kepemilikan brand. */
export async function findSubscriptionForBrand(id: string, brandId: string) {
  return db.query.subscriptions.findFirst({
    where: and(eq(subscriptions.id, id), eq(subscriptions.brandId, brandId)),
  })
}

/** Tipe status langganan sebagai union string — dipakai `z.enum()` di server function admin. */
export const SUBSCRIPTION_STATUSES: Array<SubscriptionStatus> = [
  'pending',
  'active',
  'expired',
  'rejected',
]

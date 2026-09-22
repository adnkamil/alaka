import { getSessionUser } from './auth'
import { listActiveSubscriptions } from './subscription-queries'
import {
  canUseFeature,
  featureLockedMessage,
  hasFullAccess,
  resolveEntitlement,
} from './subscription'
import type { TrialFields } from './subscription-queries'
import type { Entitlement, ProFeature } from './subscription'

/**
 * SISTEM ENTITLEMENT TERPUSAT (server).
 *
 * Semua pengecekan akses fitur lewat file ini — server function tidak boleh
 * menulis `plan === 'pro'` / `isPro` sendiri-sendiri:
 *   1. ambil status   -> `getUserEntitlements(user)` (baca trial di `users` +
 *      baris `subscriptions`; aturannya ada di `src/lib/subscription.ts`).
 *   2. cek fitur      -> `canUseFeature(entitlements, 'billing')`. Kunci fitur
 *      yang valid: lihat `PRO_FEATURES` di `src/lib/subscription.ts`.
 *   3. paksa akses    -> `requireFeature()` / `requireUserFeature()` (throw).
 *
 * Client TIDAK meng-import file ini (ada koneksi `db` di dalamnya). Untuk di UI,
 * entitlement-nya ikut terkirim lewat `fetchCurrentUser()` dan dicek pakai
 * `canUseFeature()` dari `src/lib/subscription.ts` yang murni.
 */

/** Dilempar waktu fitur PRO dipakai tanpa hak akses. Pesannya siap ditampilkan. */
export class FeatureLockedError extends Error {
  readonly code = 'FEATURE_LOCKED'
  readonly feature: ProFeature

  constructor(feature: ProFeature) {
    super(featureLockedMessage(feature))
    this.name = 'FeatureLockedError'
    this.feature = feature
  }
}

/**
 * Status akses user sekarang (TRIAL / FREE / PRO) + fitur apa saja yang terbuka.
 * Ini pintu masuk utama — dipakai server function sebelum mengerjakan apa pun.
 */
export async function getUserEntitlements(
  user: TrialFields,
  now: Date = new Date(),
): Promise<Entitlement> {
  const subscriptions = await listActiveSubscriptions(user.id)

  return resolveEntitlement(
    {
      trialStartedAt: user.trialStartedAt,
      trialEndsAt: user.trialEndsAt,
      subscriptions,
    },
    now,
  )
}

/**
 * Apakah user punya akses penuh (trial atau PRO) pada waktu `at`.
 * Dipakai buat aturan grandfathering — lihat `getPublicOrderInvoice`.
 */
export async function hasFullAccessAtForUser(
  user: TrialFields,
  at: Date,
): Promise<boolean> {
  const subscriptions = await listActiveSubscriptions(user.id)

  return hasFullAccess(
    resolveEntitlement(
      {
        trialStartedAt: user.trialStartedAt,
        trialEndsAt: user.trialEndsAt,
        subscriptions,
      },
      at,
    ),
  )
}

/**
 * Pasang "pagar" fitur PRO. Selalu dipanggil di dalam server function, jadi
 * walaupun UI-nya diakali (request langsung ke endpoint), aksesnya tetap ditolak.
 */
export function requireFeature(
  entitlement: Entitlement,
  feature: ProFeature,
): void {
  if (!canUseFeature(entitlement, feature)) {
    throw new FeatureLockedError(feature)
  }
}

/**
 * Versi praktis buat server function: ambil user dari session + entitlements,
 * sekaligus pastikan fitur PRO-nya terbuka.
 *
 *   const { user } = await requireUserFeature('payment_methods')
 */
export async function requireUserFeature(feature: ProFeature) {
  const user = await getSessionUser()
  if (!user) throw new Error('Belum login')

  const entitlements = await getUserEntitlements(user)
  requireFeature(entitlements, feature)

  return { user, entitlements }
}

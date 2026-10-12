import type { brandRoleEnum } from '../db/schema'

/**
 * Matriks izin per peran di dalam brand — SATU tempat untuk mengubah siapa
 * boleh apa. Murni (tanpa `db`).
 *
 * `owner` boleh semuanya. `admin` hanya aksi operasional harian. Aksi yang
 * menyangkut uang, identitas brand, dan siapa yang punya akses ke brand
 * dipegang pemilik.
 */

export type BrandRole = (typeof brandRoleEnum.enumValues)[number]

export type BrandAction =
  /** Undang/batalkan undangan, cabut admin. */
  | 'team.manage'
  /** Ajukan PRO, unggah bukti transfer, lihat riwayat langganan. */
  | 'subscription.manage'
  /** Rekening bank / QRIS tempat pelanggan membayar. */
  | 'paymentMethod.manage'
  /** Nama brand dan foto brand. */
  | 'brand.profile'
  /** Template pesan WhatsApp. */
  | 'brand.messageTemplate'
  /** Event, order, customer, aturan fee, keuangan — pekerjaan harian. */
  | 'operations'

const ADMIN_ACTIONS: ReadonlySet<BrandAction> = new Set<BrandAction>([
  'operations',
  'brand.messageTemplate',
])

export function can(role: BrandRole, action: BrandAction): boolean {
  if (role === 'owner') return true
  return ADMIN_ACTIONS.has(action)
}

export class BrandPermissionError extends Error {
  readonly action: BrandAction

  constructor(action: BrandAction) {
    super('Aksi ini hanya bisa dilakukan oleh pemilik brand.')
    this.name = 'BrandPermissionError'
    this.action = action
  }
}

/** Lempar `BrandPermissionError` kalau peran user tidak boleh melakukan aksi. */
export function requireBrandPermission(
  user: { brandRole: BrandRole },
  action: BrandAction,
): void {
  if (!can(user.brandRole, action)) throw new BrandPermissionError(action)
}

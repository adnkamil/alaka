import type { brands, users } from '../db/schema'

/**
 * Pembacaan identitas brand (tahap 4a migrasi `brands`).
 *
 * Nama brand, template pesan, dan masa trial sekarang dibaca dari tabel
 * `brands`. Supaya kode yang sudah memakai `user.brandName` dkk tidak perlu
 * diubah satu per satu, baris user yang dimuat ditimpa dengan nilai dari brand-
 * nya lewat fungsi ini. Kolom lama di `users` masih ditulis (dual-write) dan
 * baru dihapus di tahap "contract".
 *
 * File ini murni (tanpa `db`) supaya aman diimpor dari mana saja.
 */

export type BrandIdentity = Pick<
  typeof brands.$inferSelect,
  'name' | 'waMessageTemplate' | 'trialStartedAt' | 'trialEndsAt'
>

type LegacyIdentityColumns = Pick<
  typeof users.$inferSelect,
  'brandName' | 'waMessageTemplate' | 'trialStartedAt' | 'trialEndsAt'
>

/**
 * Timpa kolom identitas lama pada baris user dengan nilai dari brand-nya.
 * Kalau brand tidak ada (user belum di-backfill), user dikembalikan apa adanya
 * supaya tidak ada yang rusak. Kalau brand ada, brand SELALU menang — termasuk
 * saat `name`/`waMessageTemplate`-nya sengaja kosong.
 */
export function applyBrandIdentity<T extends LegacyIdentityColumns>(
  user: T,
  brand: BrandIdentity | null | undefined,
): T {
  if (!brand) return user
  return {
    ...user,
    brandName: brand.name,
    waMessageTemplate: brand.waMessageTemplate,
    trialStartedAt: brand.trialStartedAt,
    trialEndsAt: brand.trialEndsAt,
  }
}

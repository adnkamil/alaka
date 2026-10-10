import type { brands, users } from '../db/schema'

/**
 * Pembacaan identitas brand (tahap 4a migrasi `brands`).
 *
 * Nama brand, template pesan, foto, dan masa trial sekarang dibaca dari tabel
 * `brands`. Supaya kode yang sudah memakai `user.brandName` dkk tidak perlu
 * diubah satu per satu, baris user yang dimuat ditimpa dengan nilai dari brand-
 * nya lewat fungsi ini. Kolom lama di `users` masih ditulis (dual-write) dan
 * baru dihapus di tahap "contract".
 *
 * File ini murni (tanpa `db`) supaya aman diimpor dari mana saja.
 */

export type BrandIdentity = Pick<
  typeof brands.$inferSelect,
  | 'name'
  | 'waMessageTemplate'
  | 'avatarUpdatedAt'
  | 'trialStartedAt'
  | 'trialEndsAt'
>

type LegacyIdentityColumns = Pick<
  typeof users.$inferSelect,
  | 'brandName'
  | 'waMessageTemplate'
  | 'avatarUpdatedAt'
  | 'trialStartedAt'
  | 'trialEndsAt'
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
    avatarUpdatedAt: brand.avatarUpdatedAt,
    trialStartedAt: brand.trialStartedAt,
    trialEndsAt: brand.trialEndsAt,
  }
}

/**
 * Id brand tempat data bisnis user disimpan (tahap 4b: semua query data
 * di-scope pakai `brand_id`, bukan `user_id`).
 *
 * Melempar error kalau user belum punya brand, supaya gagalnya KENCANG: filter
 * `brand_id = NULL` tidak cocok ke baris mana pun dan akan terlihat seperti
 * "semua data hilang". Setelah `brand_id` jadi NOT NULL (tahap constrain), kasus
 * ini tidak mungkin lagi.
 */
export function brandIdOf(user: { brandId: string | null }): string {
  if (!user.brandId) {
    throw new Error(
      'Data brand akun ini belum siap. Coba lagi sebentar atau hubungi admin.',
    )
  }
  return user.brandId
}

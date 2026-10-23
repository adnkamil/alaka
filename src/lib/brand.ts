import type { brands } from '../db/schema'

/**
 * Identitas brand pada objek user.
 *
 * Nama brand, template pesan, foto, dan masa trial adalah milik BRAND (tabel
 * `brands`), bukan akun. Supaya kode yang sudah memakai `user.brandName` dkk
 * tidak perlu diubah satu per satu, baris user yang dimuat ditempeli nilai dari
 * brand-nya lewat `applyBrandIdentity`. Nama properti lama dipertahankan; yang
 * berubah hanya sumbernya.
 *
 * File ini murni (tanpa `db`) supaya aman diimpor dari mana saja.
 */

export type BrandIdentity = Pick<
  typeof brands.$inferSelect,
  | 'name'
  | 'waMessageTemplate'
  | 'waNumber'
  | 'avatarUpdatedAt'
  | 'trialStartedAt'
  | 'trialEndsAt'
>

/** Properti identitas brand yang ditempelkan ke user (nama lama dipertahankan). */
export type BrandIdentityFields = {
  brandName: string | null
  waMessageTemplate: string | null
  waNumber: string | null
  avatarUpdatedAt: Date | null
  trialStartedAt: Date
  trialEndsAt: Date
}

/**
 * `T` dengan properti identitas brand diganti nilai dari brand. Memakai `Omit`
 * supaya tipenya tidak bergantung pada kolom lama di `users`.
 */
export type WithBrandIdentity<T> = Omit<T, keyof BrandIdentityFields> &
  BrandIdentityFields

/**
 * Tempelkan identitas brand ke objek user. Brand SELALU menang, termasuk saat
 * `name`/`waMessageTemplate`/`avatarUpdatedAt`-nya sengaja kosong.
 */
export function applyBrandIdentity<T extends object>(
  user: T,
  brand: BrandIdentity,
): WithBrandIdentity<T> {
  return {
    ...user,
    brandName: brand.name,
    waMessageTemplate: brand.waMessageTemplate,
    waNumber: brand.waNumber,
    avatarUpdatedAt: brand.avatarUpdatedAt,
    trialStartedAt: brand.trialStartedAt,
    trialEndsAt: brand.trialEndsAt,
  }
}

/**
 * Id brand tempat data bisnis user disimpan (semua query data di-scope pakai
 * `brand_id`, bukan `user_id`).
 *
 * Sejak `brand_id` NOT NULL, `brandId` selalu terisi; pengecekan ini dipertahankan
 * sebagai pengaman untuk objek yang tipenya masih `string | null` (mis. data
 * dari luar), supaya gagalnya kencang: filter `brand_id = NULL` tidak cocok ke
 * baris mana pun dan akan terlihat seperti "semua data hilang".
 */
export function brandIdOf(user: { brandId: string | null }): string {
  if (!user.brandId) {
    throw new Error(
      'Data brand akun ini belum siap. Coba lagi sebentar atau hubungi admin.',
    )
  }
  return user.brandId
}

import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { brands, users } from '../db/schema'
import { applyBrandIdentity } from './brand'
import type { BrandIdentityFields } from './brand'

/**
 * Query server-only untuk identitas & keanggotaan brand.
 *
 * Nama brand, template pesan, foto, dan masa trial ditulis HANYA ke tabel
 * `brands`. Kolom lama dengan arti yang sama di `users` sudah tidak ditulis
 * maupun dibaca (akan di-drop di migrasi berikutnya).
 *
 * File ini server-only (menyentuh `db`), jadi sengaja `*-queries.ts` dan bukan
 * `*-functions.ts` — lihat `client-bundle-safety.test.ts`.
 */

type NewUserValues = Omit<
  typeof users.$inferInsert,
  'brandId' | keyof BrandIdentityFields
> & { brandName?: string | null }

/**
 * Satu-satunya cara membuat user baru yang mendaftar sendiri (tanpa undangan):
 * brand-nya dibuat di transaksi yang sama dan jadi milik user itu. Brand dibuat
 * dulu karena `users.brand_id` merujuk ke `brands.id`.
 *
 * `brandName` disimpan di brand. User yang dikembalikan sudah ditempeli
 * identitas brand-nya (`user.brandName`, trial, dst.).
 */
export async function createUserWithBrand(values: NewUserValues) {
  const { brandName, ...userValues } = values
  return db.transaction(async (tx) => {
    const [brand] = await tx
      .insert(brands)
      .values({ name: brandName ?? null })
      .returning()

    const [user] = await tx
      .insert(users)
      .values({ ...userValues, brandId: brand.id })
      .returning()

    return applyBrandIdentity(user, brand)
  })
}

/** Baris brand untuk user yang dimuat sendiri (bukan lewat sesi). */
export async function findBrand(brandId: string) {
  const brand = await db.query.brands.findFirst({
    where: eq(brands.id, brandId),
  })
  return brand ?? null
}

/**
 * Pemilik brand: akun dengan `brand_role = 'owner'` (tepat satu per brand,
 * dijaga unique index). Dipakai halaman publik (invoice) untuk menampilkan
 * identitas & memeriksa verifikasi email PEMILIK — bukan akun yang kebetulan
 * membuat event/order.
 */
export async function findBrandOwner(brandId: string) {
  const owner = await db.query.users.findFirst({
    where: and(eq(users.brandId, brandId), eq(users.brandRole, 'owner')),
  })
  return owner ?? null
}

type BrandMember = { id: string; brandId: string }

/**
 * Ubah nama user (di `users`) serta nama brand dan nomor WhatsApp brand
 * (di `brands`) — halaman Profil.
 */
export async function updateUserProfile(
  user: BrandMember,
  input: { name: string; brandName: string | null; waNumber: string | null },
) {
  const now = new Date()
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ name: input.name, updatedAt: now })
      .where(eq(users.id, user.id))

    await tx
      .update(brands)
      .set({
        name: input.brandName,
        waNumber: input.waNumber,
        updatedAt: now,
      })
      .where(eq(brands.id, user.brandId))
  })
}

/** Ubah template pesan WhatsApp milik brand. */
export async function updateBrandMessageTemplate(
  user: { brandId: string },
  template: string,
) {
  await db
    .update(brands)
    .set({ waMessageTemplate: template, updatedAt: new Date() })
    .where(eq(brands.id, user.brandId))
}

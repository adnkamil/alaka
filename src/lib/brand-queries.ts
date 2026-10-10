import { eq } from 'drizzle-orm'
import { db } from '../db'
import { brands, users } from '../db/schema'

/**
 * Helper "dual-write" untuk migrasi ke tabel `brands` (tahap 3).
 *
 * Selama masa transisi, data brand ditulis ke DUA tempat: kolom lama di `users`
 * (masih jadi sumber baca) dan tabel `brands` (calon sumber baca). Semua jalur
 * yang menulis data brand wajib lewat helper di sini supaya keduanya selalu
 * sama. Kalau tahap "switch baca" sudah selesai, tulisan ke kolom lama dihapus
 * dari sini.
 *
 * File ini server-only (menyentuh `db`), jadi sengaja `*-queries.ts` dan bukan
 * `*-functions.ts` — lihat `client-bundle-safety.test.ts`.
 */

type NewUserValues = Omit<typeof users.$inferInsert, 'brandId'>

/**
 * Satu-satunya cara membuat user baru yang mendaftar sendiri (tanpa undangan):
 * brand-nya dibuat di transaksi yang sama dan jadi milik user itu. Brand dibuat
 * dulu karena `users.brand_id` merujuk ke `brands.id`.
 *
 * Masa trial di kedua tabel otomatis sama karena `now()` di Postgres bernilai
 * sama sepanjang satu transaksi.
 */
export async function createUserWithBrand(values: NewUserValues) {
  return db.transaction(async (tx) => {
    const [brand] = await tx
      .insert(brands)
      .values({ name: values.brandName ?? null })
      .returning({ id: brands.id })

    const [user] = await tx
      .insert(users)
      .values({ ...values, brandId: brand.id })
      .returning()

    return user
  })
}

/** Baris brand untuk user yang dimuat sendiri (bukan lewat sesi). */
export async function findBrand(brandId: string | null) {
  if (!brandId) return null
  const brand = await db.query.brands.findFirst({
    where: eq(brands.id, brandId),
  })
  return brand ?? null
}

type BrandOwner = { id: string; brandId: string | null }

/** Ubah nama user + nama brand sekaligus (halaman Profil). */
export async function updateUserProfile(
  user: BrandOwner,
  input: { name: string; brandName: string | null },
) {
  const now = new Date()
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ name: input.name, brandName: input.brandName, updatedAt: now })
      .where(eq(users.id, user.id))

    if (user.brandId) {
      await tx
        .update(brands)
        .set({ name: input.brandName, updatedAt: now })
        .where(eq(brands.id, user.brandId))
    }
  })
}

/** Ubah template pesan WhatsApp di kolom lama + brand sekaligus. */
export async function updateUserMessageTemplate(
  user: BrandOwner,
  template: string,
) {
  const now = new Date()
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ waMessageTemplate: template, updatedAt: now })
      .where(eq(users.id, user.id))

    if (user.brandId) {
      await tx
        .update(brands)
        .set({ waMessageTemplate: template, updatedAt: now })
        .where(eq(brands.id, user.brandId))
    }
  })
}

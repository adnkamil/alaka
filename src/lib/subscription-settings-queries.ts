import { db } from '../db'
import { subscriptionSettings } from '../db/schema'

/** Baris `subscription_settings` (harga membership + QRIS PRO) apa adanya dari DB. */
export type SubscriptionSettingsRow = typeof subscriptionSettings.$inferSelect

/**
 * Baris tunggal (singleton) pengaturan pembayaran PRO — saat ini cuma
 * gambar QRIS admin. Return `null` kalau admin belum pernah upload.
 *
 * Return type-nya ditulis eksplisit `| null` supaya pemanggil (harga di
 * `subscription-functions.ts`, QRIS & harga di `admin-functions.ts`) ikut
 * menangani kasus "tabel masih kosong" — hasil inferensi bikin baris ini
 * kelihatan selalu terisi.
 */
export async function getSubscriptionSettings(): Promise<SubscriptionSettingsRow | null> {
  const rows = await db.select().from(subscriptionSettings).limit(1)
  return rows.length > 0 ? rows[0] : null
}

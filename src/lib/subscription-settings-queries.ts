import { db } from '../db'
import { subscriptionSettings } from '../db/schema'

/**
 * Baris tunggal (singleton) pengaturan pembayaran PRO — saat ini cuma
 * gambar QRIS admin. Return `null` kalau admin belum pernah upload.
 */
export async function getSubscriptionSettings() {
  const [row] = await db.select().from(subscriptionSettings).limit(1)
  return row ?? null
}
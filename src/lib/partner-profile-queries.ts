import { eq, sql } from 'drizzle-orm'
import { db } from '../db'
import { calendarEvents, partnerSessions, partners } from '../db/schema'

/** Profil partner — query database. Server-only; selalu per `partnerId` sesi. */

/**
 * Simpan nama dan nomor WhatsApp. Kalau namanya berubah, nama lama di daftar
 * "brand yang dipamerkan" semua event milik partner ini ikut diganti (daftar itu
 * disalin dari nama partner saat event dibuat). `array_replace` hanya mengganti
 * entri yang persis sama, jadi brand lain yang ditambahkan admin tidak tersentuh.
 */
export async function updatePartnerProfile(
  partnerId: string,
  value: { name: string; waNumber: string | null },
) {
  return db.transaction(async (tx) => {
    const current = await tx
      .select({ name: partners.name })
      .from(partners)
      .where(eq(partners.id, partnerId))
      .for('update')
    if (current.length === 0) throw new Error('Partner tidak ditemukan')
    const oldName = current[0].name

    const updated = await tx
      .update(partners)
      .set({
        name: value.name,
        waNumber: value.waNumber,
        updatedAt: new Date(),
      })
      .where(eq(partners.id, partnerId))
      .returning()

    if (oldName !== value.name) {
      await tx
        .update(calendarEvents)
        .set({
          exhibitors: sql`array_replace(${calendarEvents.exhibitors}, ${oldName}, ${value.name})`,
        })
        .where(eq(calendarEvents.partnerId, partnerId))
    }
    return updated[0]
  })
}

/**
 * Ganti kata sandi dan matikan SEMUA sesi partner (perangkat lain ikut keluar).
 * Pemanggil membuat sesi baru untuk perangkat ini sesudahnya.
 */
export async function replacePartnerPassword(
  partnerId: string,
  passwordHash: string,
) {
  await db.transaction(async (tx) => {
    await tx
      .update(partners)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(partners.id, partnerId))
    await tx
      .delete(partnerSessions)
      .where(eq(partnerSessions.partnerId, partnerId))
  })
}

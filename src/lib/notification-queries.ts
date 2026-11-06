import { db } from '../db'
import { notifications } from '../db/schema'

/**
 * Dipanggil setelah event kalender baru berhasil disimpan (oleh partner atau
 * admin ALAKA). Notifikasinya broadcast (brandId null) ke semua brand jastiper.
 *
 * Pemanggil sebaiknya membungkus ini dengan `.catch` — gagal kirim notifikasi
 * tidak boleh membatalkan pembuatan event.
 */
export async function notifyNewCalendarEvent(input: {
  calendarEventId: string
  eventName: string
  createdBy: string
}) {
  await db.insert(notifications).values({
    brandId: null,
    kind: 'event_baru',
    title: `Event baru: ${input.eventName}`,
    body: `Dibuat oleh ${input.createdBy}`,
    target: 'kalender',
    calendarEventId: input.calendarEventId,
  })
}

import { eventEndDate } from './calendar'

/**
 * Status event untuk Partner Portal — murni, tanpa `db`.
 * - selesai: sudah diakhiri partner/admin ATAU tanggal terakhirnya sudah lewat
 * - mendatang: belum mulai
 * - berjalan: sudah mulai dan belum selesai (event berjalan sampai 23.59 di
 *   tanggal terakhirnya, sama dengan aturan `isCalendarEventFinished`)
 */
export type PartnerEventStatus = 'berjalan' | 'mendatang' | 'selesai'

export function partnerEventStatus(
  event: { eventDate: string; endDate: string | null; isEnded: boolean },
  today: string,
): PartnerEventStatus {
  if (event.isEnded || eventEndDate(event) < today) return 'selesai'
  if (event.eventDate > today) return 'mendatang'
  return 'berjalan'
}

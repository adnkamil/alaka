import { eventEndDate } from './calendar'

/**
 * Aturan "Ikut Event" untuk event kalender. File ini murni (tanpa `db`) supaya
 * aman diimpor dari client dan gampang dites.
 */

export type JoinableCalendarEvent = {
  name: string
  location: string
  eventDate: string
  endDate: string | null
  isOnline: boolean
  description: string | null
}

/**
 * Event kalender masih bisa diikuti selama belum diakhiri admin dan tanggal
 * terakhirnya belum lewat (event masih berjalan sampai 23.59 di tanggal itu).
 */
export function isCalendarEventJoinable(
  event: { eventDate: string; endDate: string | null; isEnded: boolean },
  today: string,
): boolean {
  return !event.isEnded && eventEndDate(event) >= today
}

/**
 * Deskripsi event belanja hasil "Ikut Event". Tabel `events` belum punya kolom
 * lokasi, jadi lokasi event kalender ditaruh di baris pertama deskripsi,
 * disusul deskripsi aslinya kalau ada.
 */
export function buildJoinedEventDescription(
  event: Pick<JoinableCalendarEvent, 'location' | 'description'>,
): string {
  const location = event.location.trim()
  const description = event.description?.trim() ?? ''
  const lines = [location ? `Lokasi: ${location}` : '', description]
  return lines.filter(Boolean).join('\n\n')
}

/**
 * Nilai awal baris `events` untuk brand yang ikut event kalender. Tanggal
 * mengikuti tanggal mulai event kalender (sama seperti form "Event baru":
 * tanggal polos jadi tengah malam UTC, tampil sebagai tanggal yang sama di WIB).
 */
export function buildJoinedEventValues(event: JoinableCalendarEvent) {
  return {
    name: event.name,
    description: buildJoinedEventDescription(event) || null,
    eventDate: new Date(event.eventDate),
  }
}

/** Pesan error yang dipakai server dan dicocokkan client. */
export const JOIN_ERRORS = {
  waRequired: 'Isi nomor WhatsApp brand di Profil dulu sebelum ikut event.',
  notJoinable: 'Event ini sudah berakhir dan tidak bisa diikuti lagi.',
  notFound: 'Event tidak ditemukan',
  feeRuleNotFound: 'Aturan fee tidak ditemukan',
} as const

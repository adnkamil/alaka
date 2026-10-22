/**
 * Helper kalender bulanan untuk tab "Event". Semua tanggal dipakai sebagai
 * string `YYYY-MM-DD` (sama dengan kolom `calendar_event.event_date`) supaya
 * tidak ada konversi zona waktu yang bisa menggeser tanggal.
 */

/** `YYYY-MM` — dipakai sebagai kunci bulan (query key & parameter server). */
export type MonthKey = string

export const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

export const MONTH_NAMES = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
] as const

/** Kalender Indonesia dimulai dari Senin. */
export const WEEKDAY_LABELS = [
  'Sen',
  'Sel',
  'Rab',
  'Kam',
  'Jum',
  'Sab',
  'Min',
] as const

function pad(value: number) {
  return String(value).padStart(2, '0')
}

export function toMonthKey(year: number, month: number): MonthKey {
  return `${year}-${pad(month)}`
}

/** `YYYY-MM-DD` -> `YYYY-MM`. */
export function monthKeyOfDate(isoDate: string): MonthKey {
  return isoDate.slice(0, 7)
}

export function parseMonthKey(key: MonthKey): { year: number; month: number } {
  if (!MONTH_KEY_PATTERN.test(key)) throw new Error(`Bulan tidak valid: ${key}`)
  return { year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) }
}

/** Geser bulan sejauh `delta` (boleh negatif), otomatis lintas tahun. */
export function shiftMonth(key: MonthKey, delta: number): MonthKey {
  const { year, month } = parseMonthKey(key)
  const index = year * 12 + (month - 1) + delta
  return toMonthKey(Math.floor(index / 12), (index % 12) + 1)
}

export function daysInMonth(key: MonthKey): number {
  const { year, month } = parseMonthKey(key)
  // Hari ke-0 bulan berikutnya = hari terakhir bulan ini.
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** Tanggal pertama & terakhir bulan (inklusif) untuk filter `BETWEEN`. */
export function monthRange(key: MonthKey): { start: string; end: string } {
  return {
    start: `${key}-01`,
    end: `${key}-${pad(daysInMonth(key))}`,
  }
}

/**
 * Sel grid untuk satu bulan, mulai dari Senin. Sel kosong di awal/akhir
 * (hari milik bulan lain) bernilai `null`; panjang hasil selalu kelipatan 7.
 */
export function buildMonthGrid(key: MonthKey): Array<string | null> {
  const { year, month } = parseMonthKey(key)
  // getUTCDay(): 0 = Minggu. Geser supaya Senin = 0.
  const firstWeekday =
    (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7
  const total = daysInMonth(key)

  const cells: Array<string | null> = Array.from(
    { length: firstWeekday },
    () => null,
  )
  for (let day = 1; day <= total; day++) {
    cells.push(`${key}-${pad(day)}`)
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

/** `2026-10-14` -> `Rabu, 14 Oktober 2026`. */
export function formatLongDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const weekday = new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))
  return `${weekday}, ${day} ${MONTH_NAMES[month - 1]} ${year}`
}

/** Kelompokkan event per tanggal (`YYYY-MM-DD`). */
export function groupByDate<T extends { eventDate: string }>(
  rows: Array<T>,
): Map<string, Array<T>> {
  const map = new Map<string, Array<T>>()
  for (const row of rows) {
    const list = map.get(row.eventDate)
    if (list) list.push(row)
    else map.set(row.eventDate, [row])
  }
  return map
}

/** Selisih hari (to - from) untuk dua tanggal ISO `YYYY-MM-DD`. */
export function daysBetweenIso(from: string, to: string): number {
  const utc = (iso: string) => {
    const [year, month, day] = iso.split('-').map(Number)
    return Date.UTC(year, month - 1, day)
  }
  return Math.round((utc(to) - utc(from)) / 86_400_000)
}

/** Tanggal terakhir event (inklusif); event sehari berakhir di tanggal mulainya. */
export function eventEndDate(event: {
  eventDate: string
  endDate: string | null
}): string {
  return event.endDate ?? event.eventDate
}

/**
 * Event dianggap selesai kalau tanggal terakhirnya sudah lewat (event masih
 * berjalan sampai 23.59 di tanggal itu) ATAU admin sudah menekan "Akhiri
 * event". Dipakai tab Mendatang/Selesai di halaman admin dan halaman detail.
 */
export function isCalendarEventFinished(
  event: { eventDate: string; endDate: string | null; isEnded: boolean },
  today: string,
): boolean {
  return event.isEnded || eventEndDate(event) < today
}

/**
 * Filter "N hari" di tab Event: event yang akan dan sedang berlangsung dalam
 * N hari ke depan. Event yang tanggal mulainya sudah lewat tetap dihitung
 * selama tanggal terakhirnya belum lewat.
 */
export function isCalendarEventWithinDays(
  event: { eventDate: string; endDate: string | null },
  today: string,
  days: number,
): boolean {
  return (
    eventEndDate(event) >= today &&
    daysBetweenIso(today, event.eventDate) <= days
  )
}

/**
 * Rentang tanggal untuk kartu dan detail event. Event sehari memakai format
 * panjang (`Rabu, 14 Oktober 2026`); event beberapa hari memakai format ringkas
 * (`20 – 22 Nov 2026`, `28 Okt – 2 Nov 2026`, `30 Des 2026 – 2 Jan 2027`).
 */
export function formatDateRange(start: string, end: string | null): string {
  if (!end || end === start) return formatLongDate(start)
  const [y1, m1, d1] = start.split('-').map(Number)
  const [y2, m2, d2] = end.split('-').map(Number)
  const mon = (month: number) => MONTH_NAMES[month - 1].slice(0, 3)
  if (y1 !== y2) return `${d1} ${mon(m1)} ${y1} – ${d2} ${mon(m2)} ${y2}`
  if (m1 !== m2) return `${d1} ${mon(m1)} – ${d2} ${mon(m2)} ${y1}`
  return `${d1} – ${d2} ${mon(m1)} ${y1}`
}

/**
 * Halaman detail event kalender (`/kalender/<id>`) menyembunyikan bottom nav,
 * seperti halaman detail lain. Daftar kalender (`/kalender` atau `/kalender/`)
 * tetap menampilkannya.
 */
export function isCalendarDetailPath(pathname: string): boolean {
  return /^\/kalender\/[^/]+/.test(pathname)
}

/**
 * URL gambar banner event, atau null kalau belum ada. `?v=` memakai waktu
 * penggantian banner supaya URL berubah (dan cache browser ikut segar) tiap
 * banner diganti.
 */
export function calendarBannerSrc(
  eventId: string,
  bannerUpdatedAt: Date | null,
): string | null {
  if (!bannerUpdatedAt) return null
  return `/api/event-banner/${eventId}?v=${bannerUpdatedAt.getTime()}`
}

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

import { APP_TIME_ZONE, todayIsoDateInAppTimeZone } from './timezone'

/**
 * Aturan murni untuk Beranda Partner Portal (tanpa `db`, supaya bisa dites).
 */

const MS_PER_DAY = 86_400_000

function isoDayNumber(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / MS_PER_DAY
}

/**
 * Label waktu relatif per hari kalender WIB: "hari ini", "kemarin",
 * "2 hari lalu", ... Lewat 30 hari jatuh ke tanggal pendek ("12 Sep").
 * Dihitung per hari kalender (bukan per 24 jam) supaya yang bergabung
 * semalam jam 23.00 tetap "kemarin" saat dilihat pagi.
 */
export function relativeDayLabel(when: Date, now: Date = new Date()): string {
  const diff = Math.max(
    0,
    isoDayNumber(todayIsoDateInAppTimeZone(now)) -
      isoDayNumber(todayIsoDateInAppTimeZone(when)),
  )
  if (diff === 0) return 'hari ini'
  if (diff === 1) return 'kemarin'
  if (diff <= 30) return `${diff} hari lalu`
  return when
    .toLocaleDateString('id-ID', {
      timeZone: APP_TIME_ZONE,
      day: 'numeric',
      month: 'short',
    })
    .replace('.', '')
}

/** Teks bantu angka naik di kartu statistik, mis. "+3 bulan ini". */
export function gainHint(count: number, period: string): string | null {
  return count > 0 ? `+${count} ${period}` : null
}

/** Cocokkan teks pencarian (tanpa peduli huruf besar/kecil & spasi di tepi). */
export function matchesSearch(
  keyword: string,
  ...fields: Array<string | null>
) {
  const q = keyword.trim().toLowerCase()
  if (!q) return false
  return fields.some((f) => f?.toLowerCase().includes(q))
}

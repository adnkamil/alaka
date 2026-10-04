/**
 * Zona waktu yang dipakai aplikasi.
 *
 * Kolom tanggal di database bertipe `timestamptz`, jadi yang tersimpan adalah
 * *instant* absolut (UTC) — itu cara SIMPANNYA dan tidak diubah. Konstanta ini
 * dipakai untuk KONVERSI saat menampilkan/menghitung: Alaka dipakai untuk jastip
 * Indonesia, jadi tanggal bisnis (default tanggal event, pengelompokan bulan di
 * laporan keuangan, tampilan tanggal) selalu dihitung dalam WIB. Dengan begitu
 * hasilnya sama walau zona perangkat user di-set ke zona lain.
 *
 * Catatan: di `src/lib/finance-functions.ts` zona ini ditulis sebagai literal di
 * dalam SQL. Itu bukan duplikasi yang lupa disinkronkan — ekspresi `GROUP BY`
 * dan `ORDER BY` harus identik secara teks, sedangkan kalau dikirim sebagai
 * bind parameter Postgres menganggapnya ekspresi yang berbeda.
 */
export const APP_TIME_ZONE = 'Asia/Jakarta'

/**
 * Tanggal "hari ini" menurut `APP_TIME_ZONE` dalam format `YYYY-MM-DD`
 * (format yang diterima `<input type="date">`). Memakai `formatToParts` supaya
 * urutannya pasti tahun-bulan-tanggal, tidak bergantung pada locale/ICU runtime.
 */
export function todayIsoDateInAppTimeZone(now: Date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''

  return `${get('year')}-${get('month')}-${get('day')}`
}

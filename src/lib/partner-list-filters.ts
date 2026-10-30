/**
 * Filter daftar partner yang dipakai UI dan server (murni, tanpa `db`).
 */

/** Tab status di halaman Katalog partner. */
export type PartnerProductTab = 'all' | 'aktif' | 'nonaktif'

export const PARTNER_PRODUCT_TABS: ReadonlyArray<PartnerProductTab> = [
  'all',
  'aktif',
  'nonaktif',
]

export const PARTNER_SEARCH_MAX = 100

/**
 * Menetralkan `%`, `_`, dan `\` agar kata kunci pengguna dicari apa adanya
 * di `ILIKE` (bukan sebagai pola). Dipakai dengan escape bawaan Postgres (`\`).
 */
export function escapeLike(keyword: string): string {
  return keyword.replace(/[\\%_]/g, (char) => `\\${char}`)
}

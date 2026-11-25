/**
 * Pencocokan teks untuk pencarian global di topbar Partner Portal (produk &
 * event). Murni, tanpa `db`, supaya bisa dites.
 */

/** Cocokkan teks pencarian (tanpa peduli huruf besar/kecil & spasi di tepi). */
export function matchesSearch(
  keyword: string,
  ...fields: Array<string | null>
) {
  const q = keyword.trim().toLowerCase()
  if (!q) return false
  return fields.some((f) => f?.toLowerCase().includes(q))
}

/**
 * Persen diskon dari harga awal (yang dicoret) ke harga promo.
 *
 * Murni (tanpa `db`) supaya bisa dipakai bareng di server & client, dan jadi
 * satu-satunya tempat perhitungan persen. Return `null` kalau tidak ada diskon
 * yang bisa ditampilkan (harga awal kosong, atau tidak lebih besar dari promo).
 */
export function discountPercent(
  originalPrice: string | number | null | undefined,
  promoPrice: string | number | null | undefined,
): number | null {
  if (originalPrice == null || promoPrice == null) return null
  const original = Number(originalPrice)
  const promo = Number(promoPrice)
  if (!Number.isFinite(original) || !Number.isFinite(promo)) return null
  if (original <= 0 || promo < 0 || promo >= original) return null
  return Math.round(((original - promo) / original) * 100)
}

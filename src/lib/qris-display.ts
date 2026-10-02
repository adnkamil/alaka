import { toDynamicQris, QrisError } from './qris'

/**
 * Tentukan QRIS yang harus ditampilkan ke member:
 * - Kalau qrisString ada dan proPrice > 0, buat payload QRIS dinamis.
 * - Kalau gagal (QrisError) atau data tidak cukup, kembalikan null → fallback ke qrisImage statis.
 *
 * Fungsi murni (string → string|null), tanpa dependensi DOM/DB.
 */
export function buildDynamicQrisPayload(
  qrisString: string | null | undefined,
  proPrice: string | number | null | undefined,
): string | null {
  if (!qrisString) return null
  const amount = Math.round(Number(proPrice ?? 0))
  if (!amount || amount <= 0) return null
  try {
    return toDynamicQris(qrisString, amount)
  } catch (err) {
    if (err instanceof QrisError) return null
    throw err
  }
}

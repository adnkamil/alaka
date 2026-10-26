/**
 * Aturan katalog produk partner — murni, tanpa `db`, dipakai UI dan server.
 */

export const PRODUCT_NAME_MAX = 120
export const PRODUCT_CODE_MAX = 40
export const PRODUCT_DESCRIPTION_MAX = 1000
/** Batas harga (rupiah) — di bawah batas kolom `decimal(12,2)`. */
export const PRODUCT_PRICE_MAX = 999_999_999

/** Foto produk: potongan kotak 480x480, WebP/JPEG, maks 100 KB (sama dgn avatar). */
export const PRODUCT_PHOTO_SIZE_PX = 480

/**
 * Baca harga yang diketik partner jadi rupiah bulat. Menerima "189000",
 * "189.000", "Rp189.000", "Rp 1.250.000". Menolak desimal/koma, angka negatif,
 * pemisah ribuan yang salah ("1.5", "12.34"), dan nilai di atas batas.
 */
export function parseRupiah(input: string): number | null {
  const cleaned = input
    .trim()
    .replace(/^rp\.?\s*/i, '')
    .replace(/\s+/g, '')
  let digits: string
  if (/^\d+$/.test(cleaned)) {
    digits = cleaned
  } else if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    digits = cleaned.replaceAll('.', '')
  } else {
    return null
  }
  const value = Number(digits)
  return value <= PRODUCT_PRICE_MAX ? value : null
}

export function formatRupiah(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value)
}

/** Alamat foto produk; `version` (photoUpdatedAt) mengganti URL saat foto diganti. */
export function partnerProductPhotoUrl(
  productId: string,
  photoUpdatedAt: Date | string | null,
): string | null {
  if (!photoUpdatedAt) return null
  const version = new Date(photoUpdatedAt).getTime()
  return `/api/partner-product-photo/${productId}?v=${version}`
}

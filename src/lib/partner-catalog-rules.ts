/**
 * Aturan katalog PDF partner — murni, tanpa `db`/storage, dipakai UI dan server.
 *
 * Batas 4 MB: berkas dikirim lewat server function sebagai base64 (+33%), dan
 * fungsi Netlify menolak body di atas ~6 MB. 4 MB -> ~5,4 MB di kabel, masih
 * aman. Katalog yang lebih besar perlu dikompres dulu oleh partner.
 */
export const CATALOG_PDF_MAX_BYTES = 4 * 1024 * 1024

/** Panjang maksimum string base64 untuk `CATALOG_PDF_MAX_BYTES` (+ sedikit sisa). */
export const CATALOG_PDF_MAX_BASE64_LENGTH =
  Math.ceil((CATALOG_PDF_MAX_BYTES * 4) / 3) + 8

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d] // "%PDF-"

/** Isi berkas diawali "%PDF-"? Tipe diputuskan dari isi, bukan nama/MIME. */
export function isPdfBytes(bytes: Uint8Array): boolean {
  if (bytes.length < PDF_MAGIC.length) return false
  return PDF_MAGIC.every((byte, i) => bytes[i] === byte)
}

/**
 * Nama berkas yang aman dipakai di header unduhan: tanpa path / karakter
 * kontrol / tanda kutip, berakhiran `.pdf`, maksimal 80 karakter. Kalau nama
 * dari partner tidak bisa dipakai, pakai `fallback` (mis. "Katalog Wikibex").
 */
export function safeCatalogFileName(raw: string, fallback: string): string {
  const withoutExt = raw.replace(/\.pdf$/i, '')
  const cleaned = withoutExt
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f"\\/:*?<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // Titik di depan = berkas tersembunyi / sisa "../"; buang.
    .replace(/^[.\s]+/, '')
    .slice(0, 80)
    .trim()
  if (cleaned) return `${cleaned}.pdf`
  const fb = fallback
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f"\\/:*?<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+/, '')
    .slice(0, 80)
    .trim()
  return `${fb || 'Katalog'}.pdf`
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

/** Alamat unduhan katalog partner; `version` mengganti URL saat berkas diganti. */
export function partnerCatalogUrl(
  partnerId: string,
  updatedAt: Date | string,
): string {
  return `/api/partner-catalog/${partnerId}?v=${new Date(updatedAt).getTime()}`
}

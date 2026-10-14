import { detectAvatarContentType } from './avatar-validation'
import type { AvatarContentType } from './avatar-validation'

/**
 * Aturan banner event kalender yang dipakai server dan client.
 *
 * Client memotong gambar jadi 16:9, memperkecilnya ke 1280x720 lalu mengirimnya
 * sebagai data URL (pola yang sama dengan foto brand di `avatar-validation.ts`).
 * Server TIDAK percaya client: tipe, ukuran, dan isi file dicek ulang di sini
 * sebelum disimpan ke Blobs. Format yang diterima sama dengan avatar.
 */

export const CALENDAR_BANNER_WIDTH_PX = 1280
export const CALENDAR_BANNER_HEIGHT_PX = 720
export const CALENDAR_BANNER_MAX_BYTES = 300 * 1024

// Batas panjang string data URL (base64 ~ 4/3 ukuran asli + prefix). Dipakai di
// validator zod supaya payload raksasa ditolak sebelum di-decode.
export const CALENDAR_BANNER_MAX_DATA_URL_LENGTH =
  Math.ceil((CALENDAR_BANNER_MAX_BYTES * 4) / 3) + 64

const DATA_URL_PATTERN =
  /^data:(image\/webp|image\/jpeg);base64,([A-Za-z0-9+/]+={0,2})$/

export function parseCalendarBannerDataUrl(dataUrl: string): {
  bytes: Uint8Array
  contentType: AvatarContentType
} {
  const match = DATA_URL_PATTERN.exec(dataUrl)
  if (!match) {
    throw new Error('Format banner tidak valid. Gunakan gambar WebP atau JPEG.')
  }

  const [, claimedType, base64] = match

  // Cek ukuran dari panjang base64 dulu, sebelum di-decode. Padding `=` tidak
  // dihitung sebagai data, supaya file tepat di batas tidak ikut ditolak.
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  const decodedBytes = (base64.length * 3) / 4 - padding
  if (decodedBytes > CALENDAR_BANNER_MAX_BYTES) {
    throw new Error('Banner terlalu besar. Maksimal 300 KB setelah diperkecil.')
  }

  let bytes: Uint8Array
  try {
    bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
  } catch {
    throw new Error('Banner rusak. Coba pilih gambar lain.')
  }

  if (bytes.length === 0 || bytes.length > CALENDAR_BANNER_MAX_BYTES) {
    throw new Error('Banner terlalu besar. Maksimal 300 KB setelah diperkecil.')
  }

  const actualType = detectAvatarContentType(bytes)
  if (actualType === null || actualType !== claimedType) {
    throw new Error('Isi file bukan gambar WebP/JPEG yang valid.')
  }

  return { bytes, contentType: actualType }
}

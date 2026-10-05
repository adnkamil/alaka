/**
 * Aturan foto brand (avatar) yang dipakai server dan client.
 *
 * Client memotong foto jadi kotak 256x256 lalu mengirimnya sebagai data URL.
 * Server TIDAK percaya client: tipe, ukuran, dan isi file dicek ulang di sini
 * sebelum disimpan ke storage.
 */

export const AVATAR_SIZE_PX = 256
export const AVATAR_MAX_BYTES = 100 * 1024

export type AvatarContentType = 'image/webp' | 'image/jpeg'

// Batas panjang string data URL (base64 ~ 4/3 ukuran asli + prefix). Dipakai di
// validator zod supaya payload raksasa ditolak sebelum di-decode.
export const AVATAR_MAX_DATA_URL_LENGTH =
  Math.ceil((AVATAR_MAX_BYTES * 4) / 3) + 64

const DATA_URL_PATTERN =
  /^data:(image\/webp|image\/jpeg);base64,([A-Za-z0-9+/]+={0,2})$/

/** Kenali tipe gambar dari byte awalnya (bukan dari label yang diklaim). */
export function detectAvatarContentType(
  bytes: Uint8Array,
): AvatarContentType | null {
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  // WebP: "RIFF" .... "WEBP"
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp'
  }
  return null
}

export function parseAvatarDataUrl(dataUrl: string): {
  bytes: Uint8Array
  contentType: AvatarContentType
} {
  const match = DATA_URL_PATTERN.exec(dataUrl)
  if (!match) {
    throw new Error('Format foto tidak valid. Gunakan foto WebP atau JPEG.')
  }

  const [, claimedType, base64] = match

  // Cek ukuran dari panjang base64 dulu, sebelum di-decode. Padding `=` tidak
  // dihitung sebagai data, supaya file tepat di batas tidak ikut ditolak.
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  const decodedBytes = (base64.length * 3) / 4 - padding
  if (decodedBytes > AVATAR_MAX_BYTES) {
    throw new Error('Foto terlalu besar. Maksimal 100 KB setelah diperkecil.')
  }

  let bytes: Uint8Array
  try {
    bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
  } catch {
    throw new Error('Foto rusak. Coba pilih foto lain.')
  }

  if (bytes.length === 0 || bytes.length > AVATAR_MAX_BYTES) {
    throw new Error('Foto terlalu besar. Maksimal 100 KB setelah diperkecil.')
  }

  const actualType = detectAvatarContentType(bytes)
  if (actualType === null || actualType !== claimedType) {
    throw new Error('Isi file bukan gambar WebP/JPEG yang valid.')
  }

  return { bytes, contentType: actualType }
}

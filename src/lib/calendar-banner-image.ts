import { blobToDataUrl, canvasToBlob, decodeImage } from './avatar-image'
import {
  CALENDAR_BANNER_HEIGHT_PX,
  CALENDAR_BANNER_MAX_BYTES,
  CALENDAR_BANNER_WIDTH_PX,
} from './calendar-banner'

export { blobToDataUrl }

// Sama dengan foto brand: yang lebih besar dari ini ditolak sebelum didecode
// supaya HP murah tidak kehabisan memori.
export const CALENDAR_BANNER_MAX_SOURCE_BYTES = 15 * 1024 * 1024

/**
 * Potongan terbesar rasio `ratio` (lebar/tinggi) yang pas di tengah gambar.
 * Gambar yang lebih lebar dipotong sisi kiri-kanannya, yang lebih tinggi
 * dipotong sisi atas-bawahnya.
 */
export function computeCoverCrop(
  width: number,
  height: number,
  ratio: number,
): { sx: number; sy: number; sw: number; sh: number } {
  if (width / height > ratio) {
    const sw = Math.floor(height * ratio)
    return { sx: Math.floor((width - sw) / 2), sy: 0, sw, sh: height }
  }
  const sh = Math.floor(width / ratio)
  return { sx: 0, sy: Math.floor((height - sh) / 2), sw: width, sh }
}

/**
 * Potong tengah jadi 16:9, perkecil ke 1280x720, lalu encode jadi WebP
 * (JPEG kalau browser nggak bisa encode WebP, mis. Safari lama), di bawah
 * `CALENDAR_BANNER_MAX_BYTES`.
 */
export async function fileToCalendarBannerBlob(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) {
    throw new Error('File yang dipilih bukan gambar.')
  }
  if (file.size > CALENDAR_BANNER_MAX_SOURCE_BYTES) {
    throw new Error('Gambar terlalu besar (maksimal 15 MB).')
  }

  const decoded = await decodeImage(file)
  try {
    const { sx, sy, sw, sh } = computeCoverCrop(
      decoded.width,
      decoded.height,
      CALENDAR_BANNER_WIDTH_PX / CALENDAR_BANNER_HEIGHT_PX,
    )
    if (sw <= 0 || sh <= 0) throw new Error('Gambar tidak valid.')

    const canvas = document.createElement('canvas')
    canvas.width = CALENDAR_BANNER_WIDTH_PX
    canvas.height = CALENDAR_BANNER_HEIGHT_PX
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Browser tidak mendukung pengolahan gambar.')

    // Latar putih: PNG transparan jadi JPEG tidak berubah hitam.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, CALENDAR_BANNER_WIDTH_PX, CALENDAR_BANNER_HEIGHT_PX)
    ctx.drawImage(
      decoded.source,
      sx,
      sy,
      sw,
      sh,
      0,
      0,
      CALENDAR_BANNER_WIDTH_PX,
      CALENDAR_BANNER_HEIGHT_PX,
    )

    for (const type of ['image/webp', 'image/jpeg']) {
      for (const quality of [0.85, 0.7, 0.55, 0.4]) {
        const blob = await canvasToBlob(canvas, type, quality)
        // Browser yang nggak bisa encode `type` mengembalikan PNG / null.
        if (!blob || blob.type !== type) break
        if (blob.size <= CALENDAR_BANNER_MAX_BYTES) return blob
      }
    }
    throw new Error('Gambar tidak bisa diperkecil. Coba gambar lain.')
  } finally {
    decoded.release()
  }
}

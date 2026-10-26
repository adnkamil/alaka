import {
  AVATAR_MAX_SOURCE_BYTES,
  blobToDataUrl,
  canvasToBlob,
  computeSquareCrop,
  decodeImage,
} from './avatar-image'
import { AVATAR_MAX_BYTES } from './avatar-validation'
import { PRODUCT_PHOTO_SIZE_PX } from './partner-product-rules'

export { blobToDataUrl }

/**
 * Potong tengah jadi kotak, perkecil ke 480x480, lalu encode WebP (JPEG kalau
 * browser tidak bisa encode WebP) di bawah batas yang sama dengan avatar.
 * Server tetap mengecek ulang isinya (`parseAvatarDataUrl`).
 */
export async function fileToProductPhotoBlob(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) {
    throw new Error('File yang dipilih bukan gambar.')
  }
  if (file.size > AVATAR_MAX_SOURCE_BYTES) {
    throw new Error('Foto terlalu besar (maksimal 15 MB).')
  }

  const decoded = await decodeImage(file)
  try {
    const { sx, sy, size } = computeSquareCrop(decoded.width, decoded.height)
    if (size <= 0) throw new Error('Foto tidak valid.')

    const canvas = document.createElement('canvas')
    canvas.width = PRODUCT_PHOTO_SIZE_PX
    canvas.height = PRODUCT_PHOTO_SIZE_PX
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Browser tidak mendukung pengolahan foto.')

    // Latar putih: PNG transparan jadi JPEG tidak berubah hitam.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, PRODUCT_PHOTO_SIZE_PX, PRODUCT_PHOTO_SIZE_PX)
    ctx.drawImage(
      decoded.source,
      sx,
      sy,
      size,
      size,
      0,
      0,
      PRODUCT_PHOTO_SIZE_PX,
      PRODUCT_PHOTO_SIZE_PX,
    )

    for (const type of ['image/webp', 'image/jpeg']) {
      for (const quality of [0.85, 0.7, 0.55, 0.4]) {
        const blob = await canvasToBlob(canvas, type, quality)
        // Browser yang nggak bisa encode `type` mengembalikan PNG / null.
        if (!blob || blob.type !== type) break
        if (blob.size <= AVATAR_MAX_BYTES) return blob
      }
    }
    throw new Error('Foto tidak bisa diperkecil. Coba foto lain.')
  } finally {
    decoded.release()
  }
}

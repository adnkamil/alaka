import { AVATAR_MAX_BYTES, AVATAR_SIZE_PX } from './avatar-validation'

// Foto kamera bisa belasan MB; yang lebih besar dari ini ditolak sebelum
// didecode supaya HP murah tidak kehabisan memori.
export const AVATAR_MAX_SOURCE_BYTES = 15 * 1024 * 1024

/** Kotak terbesar yang pas di tengah gambar (potong tengah, rasio 1:1). */
export function computeSquareCrop(
  width: number,
  height: number,
): { sx: number; sy: number; size: number } {
  const size = Math.min(width, height)
  return {
    sx: Math.floor((width - size) / 2),
    sy: Math.floor((height - size) / 2),
    size,
  }
}

interface DecodedImage {
  source: CanvasImageSource
  width: number
  height: number
  release: () => void
}

async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file)
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      }
    } catch {
      // Lanjut ke jalur <img> di bawah.
    }
  }

  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('decode'))
      el.src = url
    })
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    }
  } catch {
    URL.revokeObjectURL(url)
    throw new Error(
      'Foto tidak bisa dibaca. Coba foto lain (JPG, PNG, atau WebP).',
    )
  }
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/**
 * Potong tengah jadi kotak, perkecil ke 256x256, lalu encode jadi WebP
 * (JPEG kalau browser nggak bisa encode WebP, mis. Safari lama). Hasilnya
 * ~15-30 KB, jauh di bawah batas `AVATAR_MAX_BYTES`.
 */
export async function fileToAvatarBlob(file: File): Promise<Blob> {
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
    canvas.width = AVATAR_SIZE_PX
    canvas.height = AVATAR_SIZE_PX
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Browser tidak mendukung pengolahan foto.')

    // Latar putih: PNG transparan jadi JPEG tidak berubah hitam.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, AVATAR_SIZE_PX, AVATAR_SIZE_PX)
    ctx.drawImage(
      decoded.source,
      sx,
      sy,
      size,
      size,
      0,
      0,
      AVATAR_SIZE_PX,
      AVATAR_SIZE_PX,
    )

    for (const type of ['image/webp', 'image/jpeg']) {
      for (const quality of [0.85, 0.7, 0.55]) {
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

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Gagal membaca foto'))
    reader.readAsDataURL(blob)
  })
}

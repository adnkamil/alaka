import { canvasToBlob, decodeImage } from './avatar-image'
import { PAYMENT_PROOF_MAX_BYTES } from './payment-proof'

/**
 * Kompres otomatis bukti transfer di client (murni client — jangan di-import
 * dari kode server).
 *
 * Aturannya: gambar yang sudah <= batas server dikirim apa adanya. Yang lebih
 * besar diperkecil (sisi terpanjang maks `PAYMENT_PROOF_MAX_SIDE_PX`, tidak
 * pernah diperbesar) lalu di-encode JPEG dengan kualitas diturunkan bertahap
 * sampai muat di bawah `PAYMENT_PROOF_MAX_BYTES`. PNG ikut jadi JPEG karena
 * kualitas PNG tidak bisa diturunkan; screenshot transfer tetap terbaca di
 * 1000px. Server tetap mengecek ulang ukuran dan isi file.
 */

export const PAYMENT_PROOF_MAX_SIDE_PX = 1000

// Sama dengan foto brand: yang lebih besar dari ini ditolak sebelum didecode
// supaya HP murah tidak kehabisan memori.
export const PAYMENT_PROOF_MAX_SOURCE_BYTES = 15 * 1024 * 1024

const JPEG_QUALITIES = [0.85, 0.75, 0.65, 0.55, 0.45]

/** Ukuran hasil resize: sisi terpanjang <= `maxSide`, rasio tetap, tanpa upscale. */
export function computeFitSize(
  width: number,
  height: number,
  maxSide: number,
): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= maxSide) return { width, height }
  const scale = maxSide / longest
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

export async function fileToPaymentProofBlob(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) {
    throw new Error('File yang dipilih bukan gambar.')
  }
  if (file.size > PAYMENT_PROOF_MAX_SOURCE_BYTES) {
    throw new Error('Gambar terlalu besar (maksimal 15 MB).')
  }
  // Sudah cukup kecil: kirim apa adanya, tanpa kehilangan kualitas.
  if (file.size <= PAYMENT_PROOF_MAX_BYTES) return file

  const decoded = await decodeImage(file)
  try {
    const { width, height } = computeFitSize(
      decoded.width,
      decoded.height,
      PAYMENT_PROOF_MAX_SIDE_PX,
    )
    if (decoded.width <= 0 || decoded.height <= 0) {
      throw new Error('Gambar tidak valid.')
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Browser tidak mendukung pengolahan gambar.')

    // Latar putih: PNG transparan jadi JPEG tidak berubah hitam.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(decoded.source, 0, 0, width, height)

    for (const quality of JPEG_QUALITIES) {
      const blob = await canvasToBlob(canvas, 'image/jpeg', quality)
      if (
        blob &&
        blob.type === 'image/jpeg' &&
        blob.size <= PAYMENT_PROOF_MAX_BYTES
      ) {
        return blob
      }
    }
    throw new Error('Gambar tidak bisa diperkecil. Coba screenshot ulang.')
  } finally {
    decoded.release()
  }
}

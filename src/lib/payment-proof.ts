/**
 * Aturan bukti transfer langganan PRO (murni, tanpa `db`/storage — aman di-import
 * dari client).
 *
 * Client mengirim gambar sebagai data URL; server TIDAK percaya client: tipe,
 * ukuran, dan isi file dicek ulang di sini sebelum disimpan ke Blobs.
 */

export const PAYMENT_PROOF_MAX_BYTES = 1_500_000 // ~1.5MB, sama dengan di client

export type PaymentProofContentType = 'image/png' | 'image/jpeg' | 'image/webp'

// Batas panjang string data URL (base64 ~ 4/3 ukuran asli + prefix). Dipakai di
// validator zod supaya payload raksasa ditolak sebelum di-decode.
export const PAYMENT_PROOF_MAX_DATA_URL_LENGTH =
  Math.ceil((PAYMENT_PROOF_MAX_BYTES * 4) / 3) + 64

const DATA_URL_PATTERN =
  /^data:(image\/png|image\/jpe?g|image\/webp);base64,([A-Za-z0-9+/]+={0,2})$/

/** Kenali tipe gambar dari byte awalnya (bukan dari label yang diklaim). */
export function detectPaymentProofContentType(
  bytes: Uint8Array,
): PaymentProofContentType | null {
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png'
  }
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

/** Ubah data URL jadi byte + tipe asli. Melempar Error berpesan ramah user. */
export function parsePaymentProofDataUrl(dataUrl: string): {
  bytes: Uint8Array
  contentType: PaymentProofContentType
} {
  const match = DATA_URL_PATTERN.exec(dataUrl)
  if (!match) {
    throw new Error('Format bukti transfer harus PNG, JPEG, atau WEBP')
  }

  const base64 = match[2]
  // Padding `=` tidak dihitung sebagai data, supaya file tepat di batas tidak
  // ikut ditolak.
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  const decodedLength = (base64.length * 3) / 4 - padding
  if (decodedLength > PAYMENT_PROOF_MAX_BYTES) {
    throw new Error('Ukuran bukti transfer maksimal 1.5MB')
  }

  const bytes = new Uint8Array(Buffer.from(base64, 'base64'))
  const contentType = detectPaymentProofContentType(bytes)
  // Isi file harus gambar sungguhan, bukan sekadar label `image/png` di depan.
  if (!contentType) {
    throw new Error('Format bukti transfer harus PNG, JPEG, atau WEBP')
  }

  return { bytes, contentType }
}

/** URL untuk menampilkan bukti satu pengajuan (route ini wajib login). */
export function paymentProofUrl(subscriptionId: string): string {
  return `/api/subscription-proof/${subscriptionId}`
}

/**
 * Buang isi bukti dari baris `subscriptions` sebelum dikirim ke browser. Daftar
 * pengajuan tidak boleh membawa base64 (berat); gambarnya dimuat terpisah lewat
 * `paymentProofUrl()` hanya saat dilihat.
 */
export function stripProofData<
  T extends { paymentProofImage: string | null; paymentProofStored: boolean },
>(
  row: T,
): Omit<T, 'paymentProofImage' | 'paymentProofStored'> & {
  hasPaymentProof: boolean
} {
  const { paymentProofImage, paymentProofStored, ...rest } = row
  return {
    ...rest,
    hasPaymentProof: paymentProofStored || paymentProofImage !== null,
  }
}

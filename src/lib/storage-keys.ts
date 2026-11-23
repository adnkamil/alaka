/**
 * Tata letak key di Cloudflare R2. Dipakai bersama oleh `storage.ts` dan
 * `scripts/migrate-storage-to-r2.ts`, jadi jangan ubah prefix tanpa
 * memindahkan file yang sudah ada.
 *
 * Dua bucket, dipisah berdasarkan tingkat akses:
 * - `public`  (env R2_PUBLIC_BUCKET): gambar yang boleh dilihat siapa saja.
 * - `private` (env R2_PRIVATE_BUCKET): bukti transfer/bayar. JANGAN pernah
 *   dibuka publik; hanya disajikan lewat route `/api/...` yang cek akses.
 */

export type R2BucketKind = 'public' | 'private'

export const R2_KEYS = {
  avatar: (brandId: string) => `avatars/${brandId}`,
  calendarBanner: (eventId: string) => `calendar-banners/${eventId}`,
  partnerLogo: (partnerId: string) => `partner-logos/${partnerId}`,
  partnerProductPhoto: (productId: string) =>
    `partner-product-photos/${productId}`,
  partnerVariantPhoto: (optionValueId: string) =>
    `partner-variant-photos/${optionValueId}`,
  subscriptionProof: (subscriptionId: string) =>
    `subscription-proofs/${subscriptionId}`,
  invoiceProof: (invoiceId: string) => `invoice-proofs/${invoiceId}`,
  topupProof: (topupId: string) => `topup-proofs/${topupId}`,
} as const

// --- LEGACY: Netlify Blobs -------------------------------------------------
// Nama store dan key lama, hanya untuk fallback baca/hapus dan script
// migrasi. Hapus bersama fallback-nya setelah migrasi selesai.

export const LEGACY_BLOB_STORES = {
  avatars: 'avatars',
  paymentProofs: 'payment-proofs',
  calendarBanners: 'calendar-banners',
  partnerLogos: 'partner-logos',
  partnerCatalogPdfs: 'partner-catalog-pdfs',
} as const

export const LEGACY_PAYMENT_PROOF_KEYS = {
  subscription: (subscriptionId: string) => subscriptionId,
  invoice: (invoiceId: string) => `invoice-${invoiceId}`,
  topup: (topupId: string) => `topup-${topupId}`,
} as const

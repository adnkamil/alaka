import { getStore } from '@netlify/blobs'
import { detectAvatarContentType } from './avatar-validation'
import { detectPaymentProofContentType } from './payment-proof'
import type { AvatarContentType } from './avatar-validation'
import type { PaymentProofContentType } from './payment-proof'

/**
 * Penyimpanan file (server-only). SEMUA akses ke Netlify Blobs lewat file ini,
 * dan app lain cuma memanggil `putAvatar` / `getAvatar` / `deleteAvatar` dan
 * `putPaymentProof` / `getPaymentProof` / `deletePaymentProof`.
 * Kalau nanti pindah ke S3-compatible (R2, SumoPod, dst.), cukup tulis ulang
 * isi file ini — pemanggilnya tidak berubah.
 *
 * JANGAN di-import dari komponen/halaman: cuma dari handler server function
 * (`*-functions.ts`) dan route `src/routes/api/*`.
 */

const AVATAR_STORE = 'avatars'

function avatarStore() {
  return getStore({
    name: AVATAR_STORE,
    // Foto yang baru diganti harus langsung terbaca. Mode default (eventual)
    // bisa menyajikan foto lama sampai 60 detik setelah ditimpa.
    consistency: 'strong',
    // Samakan dengan region Functions (cmh, Ohio) dan Neon (us-east-2, Ohio)
    // supaya jarak function -> storage paling dekat. us-east-2 juga default
    // Netlify untuk store site-wide, jadi store ini tampil di dashboard Blobs.
    // PENTING: data TIDAK ikut pindah kalau region diganti. Store di region
    // lain akan terlihat kosong oleh app ini; salin dulu datanya (lihat
    // scripts/list-blobs.mjs untuk melihat isinya) sebelum mengganti.
    region: 'us-east-2',
  })
}

/** Simpan/timpa foto milik brand. Key = brandId, jadi tidak ada file yatim. */
export async function putAvatar(
  brandId: string,
  bytes: Uint8Array,
  contentType: AvatarContentType,
): Promise<void> {
  // Salin ke Uint8Array baru supaya buffer-nya pasti ArrayBuffer biasa
  // (bukan SharedArrayBuffer) dan diterima sebagai BlobPart.
  const body = new Blob([new Uint8Array(bytes)], { type: contentType })
  await avatarStore().set(brandId, body, { metadata: { contentType } })
}

export async function getAvatar(
  brandId: string,
): Promise<{ data: ArrayBuffer; contentType: AvatarContentType } | null> {
  // Overload `type: 'blob'` dipakai karena tipe `arrayBuffer`-nya tidak
  // mencantumkan `null`, padahal key yang tidak ada mengembalikan null.
  const result = await avatarStore().getWithMetadata(brandId, { type: 'blob' })
  if (!result) return null

  const data = await result.data.arrayBuffer()

  // Tipe dikenali dari isi file, bukan dari metadata, supaya yang disajikan
  // ke browser selalu gambar yang valid.
  const contentType = detectAvatarContentType(new Uint8Array(data))
  if (!contentType) return null

  return { data, contentType }
}

export async function deleteAvatar(brandId: string): Promise<void> {
  await avatarStore().delete(brandId)
}

// --- Bukti transfer langganan PRO ---------------------------------------
//
// BEDA dengan avatar: file ini PRIVAT. Jangan pernah disajikan tanpa cek login
// + kepemilikan (lihat `subscription-proof-queries.ts` dan route
// `/api/subscription-proof/$id`). Key = id baris `subscriptions`, bukan userId,
// karena satu user bisa punya beberapa pengajuan.

const PAYMENT_PROOF_STORE = 'payment-proofs'

function paymentProofStore() {
  // Opsi sama dengan `avatarStore()` (consistency strong, region us-east-2).
  return getStore({
    name: PAYMENT_PROOF_STORE,
    consistency: 'strong',
    region: 'us-east-2',
  })
}

export async function putPaymentProof(
  subscriptionId: string,
  bytes: Uint8Array,
  contentType: PaymentProofContentType,
): Promise<void> {
  const body = new Blob([new Uint8Array(bytes)], { type: contentType })
  await paymentProofStore().set(subscriptionId, body, {
    metadata: { contentType },
  })
}

export async function getPaymentProof(
  subscriptionId: string,
): Promise<{ data: ArrayBuffer; contentType: PaymentProofContentType } | null> {
  const result = await paymentProofStore().getWithMetadata(subscriptionId, {
    type: 'blob',
  })
  if (!result) return null

  const data = await result.data.arrayBuffer()
  // Tipe dikenali dari isi file, bukan dari metadata.
  const contentType = detectPaymentProofContentType(new Uint8Array(data))
  if (!contentType) return null

  return { data, contentType }
}

export async function deletePaymentProof(
  subscriptionId: string,
): Promise<void> {
  await paymentProofStore().delete(subscriptionId)
}

// --- Banner event kalender ----------------------------------------------
//
// Sama dengan avatar: publik (cuma gambar banner, id event berupa UUID acak),
// key = id event di tabel `calendar_event`. Format yang diterima sama dengan
// avatar (WebP/JPEG), jadi deteksi tipenya memakai fungsi yang sama.

const CALENDAR_BANNER_STORE = 'calendar-banners'

function calendarBannerStore() {
  // Opsi sama dengan `avatarStore()` (consistency strong, region us-east-2).
  return getStore({
    name: CALENDAR_BANNER_STORE,
    consistency: 'strong',
    region: 'us-east-2',
  })
}

/** Simpan/timpa banner satu event. Key = eventId, jadi tidak ada file yatim. */
export async function putCalendarBanner(
  eventId: string,
  bytes: Uint8Array,
  contentType: AvatarContentType,
): Promise<void> {
  const body = new Blob([new Uint8Array(bytes)], { type: contentType })
  await calendarBannerStore().set(eventId, body, { metadata: { contentType } })
}

export async function getCalendarBanner(
  eventId: string,
): Promise<{ data: ArrayBuffer; contentType: AvatarContentType } | null> {
  const result = await calendarBannerStore().getWithMetadata(eventId, {
    type: 'blob',
  })
  if (!result) return null

  const data = await result.data.arrayBuffer()
  // Tipe dikenali dari isi file, bukan dari metadata.
  const contentType = detectAvatarContentType(new Uint8Array(data))
  if (!contentType) return null

  return { data, contentType }
}

export async function deleteCalendarBanner(eventId: string): Promise<void> {
  await calendarBannerStore().delete(eventId)
}

// --- Foto produk partner -------------------------------------------------
//
// Publik seperti avatar/banner (cuma gambar produk, id berupa UUID acak),
// key = id baris `partner_products`. Format sama dengan avatar (WebP/JPEG).

const PARTNER_PRODUCT_PHOTO_STORE = 'partner-product-photos'

function partnerProductPhotoStore() {
  // Opsi sama dengan `avatarStore()` (consistency strong, region us-east-2).
  return getStore({
    name: PARTNER_PRODUCT_PHOTO_STORE,
    consistency: 'strong',
    region: 'us-east-2',
  })
}

export async function putPartnerProductPhoto(
  productId: string,
  bytes: Uint8Array,
  contentType: AvatarContentType,
): Promise<void> {
  const body = new Blob([new Uint8Array(bytes)], { type: contentType })
  await partnerProductPhotoStore().set(productId, body, {
    metadata: { contentType },
  })
}

export async function getPartnerProductPhoto(
  productId: string,
): Promise<{ data: ArrayBuffer; contentType: AvatarContentType } | null> {
  const result = await partnerProductPhotoStore().getWithMetadata(productId, {
    type: 'blob',
  })
  if (!result) return null

  const data = await result.data.arrayBuffer()
  // Tipe dikenali dari isi file, bukan dari metadata.
  const contentType = detectAvatarContentType(new Uint8Array(data))
  if (!contentType) return null

  return { data, contentType }
}

export async function deletePartnerProductPhoto(
  productId: string,
): Promise<void> {
  await partnerProductPhotoStore().delete(productId)
}

import { getStore } from '@netlify/blobs'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
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

// --- Bukti bayar tagihan partner ----------------------------------------
//
// PRIVAT, sama seperti bukti transfer langganan: hanya partner pemilik tagihan
// dan jastiper yang ditagih yang boleh melihat (lihat route
// `/api/invoice-proof/$id`). Store yang sama, key diberi awalan `invoice-`
// supaya tidak bertabrakan dengan id langganan.

const invoiceProofKey = (invoiceId: string) => `invoice-${invoiceId}`

export async function putInvoiceProof(
  invoiceId: string,
  bytes: Uint8Array,
  contentType: PaymentProofContentType,
): Promise<void> {
  const body = new Blob([new Uint8Array(bytes)], { type: contentType })
  await paymentProofStore().set(invoiceProofKey(invoiceId), body, {
    metadata: { contentType },
  })
}

export async function getInvoiceProof(
  invoiceId: string,
): Promise<{ data: ArrayBuffer; contentType: PaymentProofContentType } | null> {
  const result = await paymentProofStore().getWithMetadata(
    invoiceProofKey(invoiceId),
    { type: 'blob' },
  )
  if (!result) return null
  const data = await result.data.arrayBuffer()
  // Tipe dikenali dari isi file, bukan dari metadata.
  const contentType = detectPaymentProofContentType(new Uint8Array(data))
  if (!contentType) return null
  return { data, contentType }
}

export async function deleteInvoiceProof(invoiceId: string): Promise<void> {
  await paymentProofStore().delete(invoiceProofKey(invoiceId))
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
//
// Disimpan di Cloudflare R2 (S3-compatible). Bucket dibuat privat; file hanya
// disajikan lewat route `/api/partner-product-photo/$id`, jadi URL dan header
// cache tetap sama dengan sebelumnya.

const PARTNER_PRODUCT_PHOTO_PREFIX = 'partner-product-photos/'

let r2Client: S3Client | null = null

function r2Config() {
  const endpoint = process.env.R2_ENDPOINT
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      'Konfigurasi R2 belum lengkap (R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET).',
    )
  }
  return { endpoint, accessKeyId, secretAccessKey, bucket }
}

function r2() {
  if (!r2Client) {
    const cfg = r2Config()
    r2Client = new S3Client({
      region: 'auto',
      endpoint: cfg.endpoint,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
    })
  }
  return r2Client
}

function partnerProductPhotoKey(productId: string): string {
  return `${PARTNER_PRODUCT_PHOTO_PREFIX}${productId}`
}

export async function putPartnerProductPhoto(
  productId: string,
  bytes: Uint8Array,
  contentType: AvatarContentType,
): Promise<void> {
  await r2().send(
    new PutObjectCommand({
      Bucket: r2Config().bucket,
      Key: partnerProductPhotoKey(productId),
      Body: bytes,
      ContentType: contentType,
    }),
  )
}

export async function getPartnerProductPhoto(
  productId: string,
): Promise<{ data: ArrayBuffer; contentType: AvatarContentType } | null> {
  let res
  try {
    res = await r2().send(
      new GetObjectCommand({
        Bucket: r2Config().bucket,
        Key: partnerProductPhotoKey(productId),
      }),
    )
  } catch (err) {
    if (err instanceof NoSuchKey) return null
    throw err
  }
  if (!res.Body) return null

  const bytes = await res.Body.transformToByteArray()
  // Tipe dikenali dari isi file, bukan dari metadata.
  const contentType = detectAvatarContentType(bytes)
  if (!contentType) return null

  const data = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer
  return { data, contentType }
}

export async function deletePartnerProductPhoto(
  productId: string,
): Promise<void> {
  await r2().send(
    new DeleteObjectCommand({
      Bucket: r2Config().bucket,
      Key: partnerProductPhotoKey(productId),
    }),
  )
}

// --- Katalog PDF partner (LEGACY) ---------------------------------------
//
// Unggah PDF sudah diganti link katalog (`partners.catalog_url`). Hanya fungsi
// hapus yang dipertahankan, untuk membersihkan berkas lama di Blobs (key = id
// partner) saat partner dihapus. Berkas lama itu tidak lagi disajikan di mana pun.

const PARTNER_CATALOG_STORE = 'partner-catalog-pdfs'

function partnerCatalogStore() {
  return getStore({
    name: PARTNER_CATALOG_STORE,
    consistency: 'strong',
    region: 'us-east-2',
  })
}

export async function deletePartnerCatalogPdf(
  partnerId: string,
): Promise<void> {
  await partnerCatalogStore().delete(partnerId)
}

// --- Logo partner --------------------------------------------------------
//
// Publik seperti avatar brand (cuma gambar logo, id berupa UUID acak), key = id
// partner. Format sama dengan avatar (WebP/JPEG persegi hasil resize di client).

const PARTNER_LOGO_STORE = 'partner-logos'

function partnerLogoStore() {
  return getStore({
    name: PARTNER_LOGO_STORE,
    consistency: 'strong',
    region: 'us-east-2',
  })
}

export async function putPartnerLogo(
  partnerId: string,
  bytes: Uint8Array,
  contentType: AvatarContentType,
): Promise<void> {
  const body = new Blob([new Uint8Array(bytes)], { type: contentType })
  await partnerLogoStore().set(partnerId, body, { metadata: { contentType } })
}

export async function getPartnerLogo(
  partnerId: string,
): Promise<{ data: ArrayBuffer; contentType: AvatarContentType } | null> {
  const result = await partnerLogoStore().getWithMetadata(partnerId, {
    type: 'blob',
  })
  if (!result) return null

  const data = await result.data.arrayBuffer()
  // Tipe dikenali dari isi file, bukan dari metadata.
  const contentType = detectAvatarContentType(new Uint8Array(data))
  if (!contentType) return null

  return { data, contentType }
}

export async function deletePartnerLogo(partnerId: string): Promise<void> {
  await partnerLogoStore().delete(partnerId)
}

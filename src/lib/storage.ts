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
import {
  LEGACY_BLOB_STORES,
  LEGACY_PAYMENT_PROOF_KEYS,
  R2_KEYS,
} from './storage-keys'
import type { AvatarContentType } from './avatar-validation'
import type { PaymentProofContentType } from './payment-proof'
import type { R2BucketKind } from './storage-keys'

/**
 * Penyimpanan file (server-only). SEMUA akses ke storage lewat file ini;
 * pemanggil cuma memakai fungsi `put*` / `get*` / `delete*` di bawah.
 *
 * Semua file disimpan di Cloudflare R2 (S3-compatible), dua bucket privat:
 * - R2_PUBLIC_BUCKET : foto brand, banner event, logo partner, foto produk
 *   & variasi partner. Isinya boleh publik, tapi bucket tetap privat dan
 *   file disajikan lewat route `/api/...`.
 * - R2_PRIVATE_BUCKET: bukti transfer langganan, bukti bayar tagihan, bukti
 *   top up. Hanya lewat route yang cek login + kepemilikan.
 * Tata letak key ada di `storage-keys.ts`.
 *
 * MASA TRANSISI: file lama masih ada di Netlify Blobs (dan foto produk lama
 * di bucket R2_BUCKET lama). Baca jatuh ke lokasi lama kalau file belum ada di
 * R2; hapus membersihkan keduanya. Setelah `scripts/migrate-storage-to-r2.ts`
 * dijalankan, hapus bagian LEGACY di bawah beserta `@netlify/blobs`.
 *
 * JANGAN di-import dari komponen/halaman: cuma dari handler server function
 * (`*-functions.ts`) dan route `src/routes/api/*`.
 */

// --- Klien R2 --------------------------------------------------------------

let r2Client: S3Client | null = null

function r2Config() {
  const endpoint = process.env.R2_ENDPOINT
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const publicBucket = process.env.R2_PUBLIC_BUCKET
  const privateBucket = process.env.R2_PRIVATE_BUCKET
  if (
    !endpoint ||
    !accessKeyId ||
    !secretAccessKey ||
    !publicBucket ||
    !privateBucket
  ) {
    throw new Error(
      'Konfigurasi R2 belum lengkap (R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_BUCKET, R2_PRIVATE_BUCKET).',
    )
  }
  if (publicBucket === privateBucket) {
    throw new Error('R2_PUBLIC_BUCKET dan R2_PRIVATE_BUCKET harus berbeda.')
  }
  return { endpoint, accessKeyId, secretAccessKey, publicBucket, privateBucket }
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

function bucketName(kind: R2BucketKind): string {
  const cfg = r2Config()
  return kind === 'public' ? cfg.publicBucket : cfg.privateBucket
}

async function r2Put(
  bucket: string,
  key: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  await r2().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: bytes,
      ContentType: contentType,
    }),
  )
}

async function r2GetBytes(
  bucket: string,
  key: string,
): Promise<Uint8Array | null> {
  let res
  try {
    res = await r2().send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  } catch (err) {
    if (err instanceof NoSuchKey) return null
    throw err
  }
  if (!res.Body) return null
  return res.Body.transformToByteArray()
}

async function r2Delete(bucket: string, key: string): Promise<void> {
  await r2().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
}

/** Ubah byte jadi hasil siap saji; tipe dikenali dari isi file, bukan metadata. */
function toFile<T extends string>(
  bytes: Uint8Array | null,
  detect: (bytes: Uint8Array) => T | null,
): { data: ArrayBuffer; contentType: T } | null {
  if (!bytes) return null
  const contentType = detect(bytes)
  if (!contentType) return null
  const data = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer
  return { data, contentType }
}

// --- LEGACY: lokasi lama (hapus setelah migrasi) ---------------------------

function legacyBlobStore(name: string) {
  return getStore({ name, consistency: 'strong', region: 'us-east-2' })
}

async function legacyBlobGet(
  store: string,
  key: string,
): Promise<Uint8Array | null> {
  // Overload `type: 'blob'` dipakai karena tipe `arrayBuffer`-nya tidak
  // mencantumkan `null`, padahal key yang tidak ada mengembalikan null.
  const result = await legacyBlobStore(store).getWithMetadata(key, {
    type: 'blob',
  })
  if (!result) return null
  return new Uint8Array(await result.data.arrayBuffer())
}

async function legacyBlobDelete(store: string, key: string): Promise<void> {
  await legacyBlobStore(store).delete(key)
}

/** Bucket R2 lama untuk foto produk/variasi, kalau masih diset dan berbeda. */
function legacyR2Bucket(): string | null {
  const legacy = process.env.R2_BUCKET
  if (!legacy) return null
  const cfg = r2Config()
  if (legacy === cfg.publicBucket || legacy === cfg.privateBucket) return null
  return legacy
}

type Legacy =
  { kind: 'blob'; store: string; key: string } | { kind: 'r2'; key: string }

async function legacyGet(legacy: Legacy): Promise<Uint8Array | null> {
  if (legacy.kind === 'blob') return legacyBlobGet(legacy.store, legacy.key)
  const bucket = legacyR2Bucket()
  return bucket ? r2GetBytes(bucket, legacy.key) : null
}

async function legacyDelete(legacy: Legacy): Promise<void> {
  if (legacy.kind === 'blob') {
    await legacyBlobDelete(legacy.store, legacy.key)
    return
  }
  const bucket = legacyR2Bucket()
  if (bucket) await r2Delete(bucket, legacy.key)
}

// --- Operasi umum ----------------------------------------------------------

async function putFile(
  kind: R2BucketKind,
  key: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  await r2Put(bucketName(kind), key, bytes, contentType)
}

async function getFileBytes(
  kind: R2BucketKind,
  key: string,
  legacy: Legacy,
): Promise<Uint8Array | null> {
  const bytes = await r2GetBytes(bucketName(kind), key)
  if (bytes) return bytes
  return legacyGet(legacy)
}

async function deleteFile(
  kind: R2BucketKind,
  key: string,
  legacy: Legacy,
): Promise<void> {
  await r2Delete(bucketName(kind), key)
  // Hapus juga salinan lama supaya script migrasi tidak menghidupkannya lagi.
  await legacyDelete(legacy)
}

// --- Foto brand (publik) ---------------------------------------------------
// Key = brandId, jadi menimpa foto tidak meninggalkan file yatim.

const avatarLegacy = (brandId: string): Legacy => ({
  kind: 'blob',
  store: LEGACY_BLOB_STORES.avatars,
  key: brandId,
})

export async function putAvatar(
  brandId: string,
  bytes: Uint8Array,
  contentType: AvatarContentType,
): Promise<void> {
  await putFile('public', R2_KEYS.avatar(brandId), bytes, contentType)
}

export async function getAvatar(
  brandId: string,
): Promise<{ data: ArrayBuffer; contentType: AvatarContentType } | null> {
  const bytes = await getFileBytes(
    'public',
    R2_KEYS.avatar(brandId),
    avatarLegacy(brandId),
  )
  return toFile(bytes, detectAvatarContentType)
}

export async function deleteAvatar(brandId: string): Promise<void> {
  await deleteFile('public', R2_KEYS.avatar(brandId), avatarLegacy(brandId))
}

// --- Bukti transfer langganan PRO (PRIVAT) ---------------------------------
//
// JANGAN pernah disajikan tanpa cek login + kepemilikan (lihat
// `subscription-proof-queries.ts` dan route `/api/subscription-proof/$id`).
// Key = id baris `subscriptions`, karena satu user bisa punya beberapa pengajuan.

const subscriptionProofLegacy = (subscriptionId: string): Legacy => ({
  kind: 'blob',
  store: LEGACY_BLOB_STORES.paymentProofs,
  key: LEGACY_PAYMENT_PROOF_KEYS.subscription(subscriptionId),
})

export async function putPaymentProof(
  subscriptionId: string,
  bytes: Uint8Array,
  contentType: PaymentProofContentType,
): Promise<void> {
  await putFile(
    'private',
    R2_KEYS.subscriptionProof(subscriptionId),
    bytes,
    contentType,
  )
}

export async function getPaymentProof(
  subscriptionId: string,
): Promise<{ data: ArrayBuffer; contentType: PaymentProofContentType } | null> {
  const bytes = await getFileBytes(
    'private',
    R2_KEYS.subscriptionProof(subscriptionId),
    subscriptionProofLegacy(subscriptionId),
  )
  return toFile(bytes, detectPaymentProofContentType)
}

export async function deletePaymentProof(
  subscriptionId: string,
): Promise<void> {
  await deleteFile(
    'private',
    R2_KEYS.subscriptionProof(subscriptionId),
    subscriptionProofLegacy(subscriptionId),
  )
}

// --- Bukti bayar tagihan partner (PRIVAT) ----------------------------------
//
// Hanya partner pemilik tagihan dan jastiper yang ditagih yang boleh melihat
// (route `/api/invoice-proof/$id`).

const invoiceProofLegacy = (invoiceId: string): Legacy => ({
  kind: 'blob',
  store: LEGACY_BLOB_STORES.paymentProofs,
  key: LEGACY_PAYMENT_PROOF_KEYS.invoice(invoiceId),
})

export async function putInvoiceProof(
  invoiceId: string,
  bytes: Uint8Array,
  contentType: PaymentProofContentType,
): Promise<void> {
  await putFile('private', R2_KEYS.invoiceProof(invoiceId), bytes, contentType)
}

export async function getInvoiceProof(
  invoiceId: string,
): Promise<{ data: ArrayBuffer; contentType: PaymentProofContentType } | null> {
  const bytes = await getFileBytes(
    'private',
    R2_KEYS.invoiceProof(invoiceId),
    invoiceProofLegacy(invoiceId),
  )
  return toFile(bytes, detectPaymentProofContentType)
}

export async function deleteInvoiceProof(invoiceId: string): Promise<void> {
  await deleteFile(
    'private',
    R2_KEYS.invoiceProof(invoiceId),
    invoiceProofLegacy(invoiceId),
  )
}

// --- Bukti transfer top up saldo partner (PRIVAT) --------------------------
//
// Hanya admin ALAKA yang boleh melihat (route `/api/partner-topup-proof/$id`).

const topupProofLegacy = (topupId: string): Legacy => ({
  kind: 'blob',
  store: LEGACY_BLOB_STORES.paymentProofs,
  key: LEGACY_PAYMENT_PROOF_KEYS.topup(topupId),
})

export async function putTopupProof(
  topupId: string,
  bytes: Uint8Array,
  contentType: PaymentProofContentType,
): Promise<void> {
  await putFile('private', R2_KEYS.topupProof(topupId), bytes, contentType)
}

export async function getTopupProof(
  topupId: string,
): Promise<{ data: ArrayBuffer; contentType: PaymentProofContentType } | null> {
  const bytes = await getFileBytes(
    'private',
    R2_KEYS.topupProof(topupId),
    topupProofLegacy(topupId),
  )
  return toFile(bytes, detectPaymentProofContentType)
}

export async function deleteTopupProof(topupId: string): Promise<void> {
  await deleteFile(
    'private',
    R2_KEYS.topupProof(topupId),
    topupProofLegacy(topupId),
  )
}

// --- Banner event kalender (publik) ----------------------------------------
// Key = id event di tabel `calendar_event`. Format sama dengan avatar.

const calendarBannerLegacy = (eventId: string): Legacy => ({
  kind: 'blob',
  store: LEGACY_BLOB_STORES.calendarBanners,
  key: eventId,
})

export async function putCalendarBanner(
  eventId: string,
  bytes: Uint8Array,
  contentType: AvatarContentType,
): Promise<void> {
  await putFile('public', R2_KEYS.calendarBanner(eventId), bytes, contentType)
}

export async function getCalendarBanner(
  eventId: string,
): Promise<{ data: ArrayBuffer; contentType: AvatarContentType } | null> {
  const bytes = await getFileBytes(
    'public',
    R2_KEYS.calendarBanner(eventId),
    calendarBannerLegacy(eventId),
  )
  return toFile(bytes, detectAvatarContentType)
}

export async function deleteCalendarBanner(eventId: string): Promise<void> {
  await deleteFile(
    'public',
    R2_KEYS.calendarBanner(eventId),
    calendarBannerLegacy(eventId),
  )
}

// --- Foto produk & variasi partner (publik) --------------------------------
// Key = id baris `partner_products` / id nilai opsi variasi. Lokasi lama:
// bucket R2_BUCKET dengan key yang sama.

export async function putPartnerProductPhoto(
  productId: string,
  bytes: Uint8Array,
  contentType: AvatarContentType,
): Promise<void> {
  await putFile(
    'public',
    R2_KEYS.partnerProductPhoto(productId),
    bytes,
    contentType,
  )
}

export async function getPartnerProductPhoto(
  productId: string,
): Promise<{ data: ArrayBuffer; contentType: AvatarContentType } | null> {
  const key = R2_KEYS.partnerProductPhoto(productId)
  const bytes = await getFileBytes('public', key, { kind: 'r2', key })
  return toFile(bytes, detectAvatarContentType)
}

export async function deletePartnerProductPhoto(
  productId: string,
): Promise<void> {
  const key = R2_KEYS.partnerProductPhoto(productId)
  await deleteFile('public', key, { kind: 'r2', key })
}

export async function putPartnerVariantPhoto(
  optionValueId: string,
  bytes: Uint8Array,
  contentType: AvatarContentType,
): Promise<void> {
  await putFile(
    'public',
    R2_KEYS.partnerVariantPhoto(optionValueId),
    bytes,
    contentType,
  )
}

export async function getPartnerVariantPhoto(
  optionValueId: string,
): Promise<{ data: ArrayBuffer; contentType: AvatarContentType } | null> {
  const key = R2_KEYS.partnerVariantPhoto(optionValueId)
  const bytes = await getFileBytes('public', key, { kind: 'r2', key })
  return toFile(bytes, detectAvatarContentType)
}

export async function deletePartnerVariantPhoto(
  optionValueId: string,
): Promise<void> {
  const key = R2_KEYS.partnerVariantPhoto(optionValueId)
  await deleteFile('public', key, { kind: 'r2', key })
}

// --- Logo partner (publik) -------------------------------------------------
// Key = id partner. Format sama dengan avatar (WebP/JPEG persegi).

const partnerLogoLegacy = (partnerId: string): Legacy => ({
  kind: 'blob',
  store: LEGACY_BLOB_STORES.partnerLogos,
  key: partnerId,
})

export async function putPartnerLogo(
  partnerId: string,
  bytes: Uint8Array,
  contentType: AvatarContentType,
): Promise<void> {
  await putFile('public', R2_KEYS.partnerLogo(partnerId), bytes, contentType)
}

export async function getPartnerLogo(
  partnerId: string,
): Promise<{ data: ArrayBuffer; contentType: AvatarContentType } | null> {
  const bytes = await getFileBytes(
    'public',
    R2_KEYS.partnerLogo(partnerId),
    partnerLogoLegacy(partnerId),
  )
  return toFile(bytes, detectAvatarContentType)
}

export async function deletePartnerLogo(partnerId: string): Promise<void> {
  await deleteFile(
    'public',
    R2_KEYS.partnerLogo(partnerId),
    partnerLogoLegacy(partnerId),
  )
}

// --- Katalog PDF partner (LEGACY, tidak dipindah ke R2) --------------------
//
// Unggah PDF sudah diganti link katalog (`partners.catalog_url`). Hanya fungsi
// hapus yang dipertahankan, untuk membersihkan berkas lama di Blobs (key = id
// partner) saat partner dihapus. Hapus fungsi ini bersama bagian LEGACY.

export async function deletePartnerCatalogPdf(
  partnerId: string,
): Promise<void> {
  await legacyBlobDelete(LEGACY_BLOB_STORES.partnerCatalogPdfs, partnerId)
}

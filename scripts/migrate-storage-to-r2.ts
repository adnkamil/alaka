// Salin semua file lama ke dua bucket R2 baru (lihat src/lib/storage-keys.ts):
// - Netlify Blobs: avatars, calendar-banners, partner-logos -> R2_PUBLIC_BUCKET
//                  payment-proofs (langganan, invoice-*, topup-*) -> R2_PRIVATE_BUCKET
// - Bucket R2 lama (R2_BUCKET): foto produk & variasi -> R2_PUBLIC_BUCKET
// Store `partner-catalog-pdfs` sengaja tidak dipindah (fitur sudah tidak dipakai).
//
// Cara pakai (isi env lewat file, mis. .env.local untuk staging):
//   pnpm storage:migrate-r2 --env-file=.env.local --dry-run   -> cek saja
//   pnpm storage:migrate-r2 --env-file=.env.local             -> salin
//
// Env yang dibutuhkan:
//   R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
//   R2_PUBLIC_BUCKET, R2_PRIVATE_BUCKET,
//   R2_BUCKET (opsional, bucket lama foto produk),
//   NETLIFY_SITE_ID, NETLIFY_AUTH_TOKEN (personal access token Netlify).
//
// Aman dijalankan berulang: file yang SUDAH ada di tujuan dilewati, jadi
// unggahan baru (yang sudah langsung ke R2) tidak tertimpa versi lama.
// Jalankan SETELAH kode baru (baca R2 + fallback lokasi lama) ter-deploy.

import { config } from 'dotenv'
import { getStore } from '@netlify/blobs'
import {
  CopyObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NotFound,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { detectAvatarContentType } from '../src/lib/avatar-validation'
import { detectPaymentProofContentType } from '../src/lib/payment-proof'
import { LEGACY_BLOB_STORES, R2_KEYS } from '../src/lib/storage-keys'

const DRY_RUN = process.argv.includes('--dry-run')
const envFileArg = process.argv.find((a) => a.startsWith('--env-file='))
config({
  path: envFileArg ? envFileArg.slice('--env-file='.length) : '.env.local',
})

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`Env ${name} belum diisi.`)
    process.exit(1)
  }
  return value
}

const R2_ENDPOINT = requireEnv('R2_ENDPOINT')
const PUBLIC_BUCKET = requireEnv('R2_PUBLIC_BUCKET')
const PRIVATE_BUCKET = requireEnv('R2_PRIVATE_BUCKET')
const LEGACY_R2_BUCKET = process.env.R2_BUCKET || null
const NETLIFY_SITE_ID = requireEnv('NETLIFY_SITE_ID')
const NETLIFY_AUTH_TOKEN = requireEnv('NETLIFY_AUTH_TOKEN')

if (PUBLIC_BUCKET === PRIVATE_BUCKET) {
  console.error('R2_PUBLIC_BUCKET dan R2_PRIVATE_BUCKET harus berbeda.')
  process.exit(1)
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
  },
})

function blobStore(name: string) {
  // Akses lewat API (di luar Netlify), region sama dengan app.
  return getStore({
    name,
    siteID: NETLIFY_SITE_ID,
    token: NETLIFY_AUTH_TOKEN,
    region: 'us-east-2',
  })
}

async function existsInR2(bucket: string, key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
    return true
  } catch (err) {
    if (err instanceof NotFound) return false
    if ((err as { name?: string }).name === 'NotFound') return false
    throw err
  }
}

const stats = { copied: 0, skipped: 0, invalid: 0, failed: 0 }

async function copyBlob(
  store: string,
  blobKey: string,
  bucket: string,
  r2Key: string,
  detect: (bytes: Uint8Array) => string | null,
): Promise<void> {
  const label = `${store}/${blobKey} -> ${bucket}/${r2Key}`
  try {
    if (await existsInR2(bucket, r2Key)) {
      stats.skipped++
      return
    }
    const result = await blobStore(store).getWithMetadata(blobKey, {
      type: 'blob',
    })
    if (!result) {
      stats.skipped++
      return
    }
    const bytes = new Uint8Array(await result.data.arrayBuffer())
    const contentType = detect(bytes)
    if (!contentType) {
      console.warn(`  [lewati, bukan gambar valid] ${label}`)
      stats.invalid++
      return
    }
    if (!DRY_RUN) {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: r2Key,
          Body: bytes,
          ContentType: contentType,
        }),
      )
    }
    console.log(`  ${DRY_RUN ? '[dry-run] ' : ''}${label}`)
    stats.copied++
  } catch (err) {
    console.error(`  [GAGAL] ${label}:`, err)
    stats.failed++
  }
}

async function listBlobKeys(store: string): Promise<string[]> {
  const { blobs } = await blobStore(store).list()
  return blobs.map((b) => b.key)
}

/** Store Blobs dengan pemetaan key 1:1 ke prefix R2. */
async function migrateSimpleStore(
  store: string,
  bucket: string,
  toR2Key: (key: string) => string,
  detect: (bytes: Uint8Array) => string | null,
) {
  const keys = await listBlobKeys(store)
  console.log(`\nStore "${store}": ${keys.length} file`)
  for (const key of keys) {
    await copyBlob(store, key, bucket, toR2Key(key), detect)
  }
}

/** payment-proofs: id langganan polos, `invoice-<id>`, `topup-<id>`. */
async function migratePaymentProofs() {
  const store = LEGACY_BLOB_STORES.paymentProofs
  const keys = await listBlobKeys(store)
  console.log(`\nStore "${store}": ${keys.length} file`)
  for (const key of keys) {
    let r2Key: string
    if (key.startsWith('invoice-')) {
      r2Key = R2_KEYS.invoiceProof(key.slice('invoice-'.length))
    } else if (key.startsWith('topup-')) {
      r2Key = R2_KEYS.topupProof(key.slice('topup-'.length))
    } else {
      r2Key = R2_KEYS.subscriptionProof(key)
    }
    await copyBlob(
      store,
      key,
      PRIVATE_BUCKET,
      r2Key,
      detectPaymentProofContentType,
    )
  }
}

/** Foto produk & variasi dari bucket R2 lama (key sama, bucket beda). */
async function migrateLegacyR2Prefix(prefix: string) {
  if (!LEGACY_R2_BUCKET) return
  if (LEGACY_R2_BUCKET === PUBLIC_BUCKET) {
    console.log(`\nR2 "${prefix}": bucket lama = bucket publik, dilewati`)
    return
  }
  const keys: string[] = []
  let token: string | undefined
  do {
    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: LEGACY_R2_BUCKET,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    )
    for (const obj of res.Contents ?? []) if (obj.Key) keys.push(obj.Key)
    token = res.IsTruncated ? res.NextContinuationToken : undefined
  } while (token)

  console.log(`\nR2 ${LEGACY_R2_BUCKET}/${prefix}: ${keys.length} file`)
  for (const key of keys) {
    const label = `${LEGACY_R2_BUCKET}/${key} -> ${PUBLIC_BUCKET}/${key}`
    try {
      if (await existsInR2(PUBLIC_BUCKET, key)) {
        stats.skipped++
        continue
      }
      if (!DRY_RUN) {
        await s3.send(
          new CopyObjectCommand({
            Bucket: PUBLIC_BUCKET,
            Key: key,
            CopySource: `${LEGACY_R2_BUCKET}/${encodeURIComponent(key).replace(/%2F/g, '/')}`,
          }),
        )
      }
      console.log(`  ${DRY_RUN ? '[dry-run] ' : ''}${label}`)
      stats.copied++
    } catch (err) {
      console.error(`  [GAGAL] ${label}:`, err)
      stats.failed++
    }
  }
}

async function main() {
  console.log(
    `Migrasi ke R2${DRY_RUN ? ' (DRY RUN, tidak ada yang ditulis)' : ''}`,
  )
  console.log(`  publik : ${PUBLIC_BUCKET}`)
  console.log(`  privat : ${PRIVATE_BUCKET}`)
  console.log(`  lama   : ${LEGACY_R2_BUCKET ?? '(tidak ada)'}`)

  await migrateSimpleStore(
    LEGACY_BLOB_STORES.avatars,
    PUBLIC_BUCKET,
    R2_KEYS.avatar,
    detectAvatarContentType,
  )
  await migrateSimpleStore(
    LEGACY_BLOB_STORES.calendarBanners,
    PUBLIC_BUCKET,
    R2_KEYS.calendarBanner,
    detectAvatarContentType,
  )
  await migrateSimpleStore(
    LEGACY_BLOB_STORES.partnerLogos,
    PUBLIC_BUCKET,
    R2_KEYS.partnerLogo,
    detectAvatarContentType,
  )
  await migratePaymentProofs()
  await migrateLegacyR2Prefix(R2_KEYS.partnerProductPhoto(''))
  await migrateLegacyR2Prefix(R2_KEYS.partnerVariantPhoto(''))

  console.log(
    `\nSelesai. disalin=${stats.copied} sudah-ada/kosong=${stats.skipped} tidak-valid=${stats.invalid} gagal=${stats.failed}`,
  )
  if (stats.failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

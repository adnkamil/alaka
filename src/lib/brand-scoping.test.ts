import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

/**
 * Penjaga tahap 4b migrasi `brands`: tabel yang sudah dipindah ke scoping
 * `brand_id` tidak boleh lagi difilter lewat `<tabel>.userId` di kode aplikasi.
 *
 * `user_id` di tabel-tabel ini tetap ada (sebagai "dibuat oleh") dan tetap
 * diisi saat insert (`userId: user.id`), jadi yang dilarang hanya pola FILTER
 * `<tabel>.userId` di luar definisi skema/relasi.
 *
 * Tambahkan nama tabel ke daftar di bawah setiap kali satu tabel selesai
 * dipindah.
 */

const SRC_DIR = fileURLToPath(new URL('..', import.meta.url))
const SCOPED_BY_BRAND = ['feeRules', 'paymentMethods', 'customers', 'events']

// Akses lewat relasi (mis. `order.event.userId`) juga dilarang untuk `events`.
const RELATION_ACCESS = String.raw`\bevent\.userId\b`

function listFiles(dir: string): Array<string> {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return listFiles(path)
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [path]
      : []
  })
}

test('tabel yang sudah di-scope brand tidak difilter lewat userId', () => {
  const offenders: Array<string> = []
  const pattern = new RegExp(
    `\\b(${SCOPED_BY_BRAND.join('|')})\\.userId\\b|${RELATION_ACCESS}`,
  )

  for (const file of listFiles(SRC_DIR)) {
    if (file.endsWith(join('db', 'schema.ts'))) continue
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, index) => {
        if (pattern.test(line)) {
          offenders.push(`${file.slice(SRC_DIR.length)}:${index + 1}`)
        }
      })
  }

  assert.deepEqual(
    offenders,
    [],
    'Filter pakai `<tabel>.brandId` dengan `brandIdOf(user)` dari lib/brand.ts.',
  )
})

/**
 * Fungsi langganan sekarang meminta id BRAND. Karena id user dan id brand
 * sama-sama `string`, TypeScript tidak akan menangkap salah kirim — test ini
 * yang menjaganya.
 */
const BRAND_KEYED_SUBSCRIPTION_FUNCTIONS = [
  'listSubscriptions',
  'listActiveSubscriptions',
  'findPendingSubscription',
  'findSubscriptionForBrand',
]

test('fungsi langganan tidak dipanggil dengan id user', () => {
  const offenders: Array<string> = []
  const call = new RegExp(
    `\\b(${BRAND_KEYED_SUBSCRIPTION_FUNCTIONS.join('|')})\\(([^)]*)\\)`,
  )
  const userIdLike = /\b(userId|user\.id|owner\.id|sub\.userId)\b/

  for (const file of listFiles(SRC_DIR)) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, index) => {
        if (/export (async )?function/.test(line)) return
        const match = call.exec(line)
        if (match && userIdLike.test(match[2])) {
          offenders.push(`${file.slice(SRC_DIR.length)}:${index + 1}`)
        }
      })
  }

  assert.deepEqual(
    offenders,
    [],
    'Kirim `brandIdOf(user)` atau `row.brandId`, bukan id user.',
  )
})

test('query langganan di lapisan entitlement tidak memfilter lewat userId', () => {
  const files = [
    'lib/subscription-queries.ts',
    'lib/entitlements.ts',
    'lib/subscription-proof-queries.ts',
    'lib/subscription-functions.ts',
  ]
  const offenders = files.flatMap((file) =>
    readFileSync(join(SRC_DIR, file), 'utf8')
      .split('\n')
      .map((line, index) => ({ line, no: index + 1 }))
      .filter(({ line }) => /\bsubscriptions\.userId\b/.test(line))
      .map(({ no }) => `${file}:${no}`),
  )
  assert.deepEqual(offenders, [])
})

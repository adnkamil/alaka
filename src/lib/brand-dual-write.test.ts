import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

/**
 * Penjaga dual-write migrasi `brands` (tahap 3).
 *
 * Selama kolom `brand_id` masih nullable, DB tidak menolak insert yang lupa
 * mengisinya — baris itu baru ketahuan saat tahap constrain (NOT NULL) gagal.
 * Test ini menangkapnya lebih awal:
 *   1. Setiap `.insert(<tabel data>)` di `src` harus menyertakan `brandId`.
 *   2. User baru hanya boleh dibuat lewat `createUserWithBrand`
 *      (`brand-queries.ts`), supaya brand-nya ikut terbentuk.
 */

const SRC_DIR = fileURLToPath(new URL('..', import.meta.url))

function listFiles(dir: string): Array<string> {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return listFiles(path)
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [path]
      : []
  })
}

const BRAND_SCOPED_TABLES = [
  'events',
  'customers',
  'feeRules',
  'paymentMethods',
  'subscriptions',
  'activityLogs',
]

test('setiap insert ke tabel data menyertakan brandId', () => {
  const offenders: Array<string> = []

  for (const file of listFiles(SRC_DIR)) {
    const text = readFileSync(file, 'utf8')
    for (const table of BRAND_SCOPED_TABLES) {
      const marker = `.insert(${table})`
      let from = 0
      for (;;) {
        const at = text.indexOf(marker, from)
        if (at === -1) break
        from = at + marker.length
        // Blok `.values(...)` berhenti di `.returning(` atau akhir statement.
        const rest = text.slice(from)
        const end = rest.search(/\.returning\(|\n\s*\n/)
        const block = end === -1 ? rest : rest.slice(0, end)
        if (!/\bbrandId\b/.test(block)) {
          const line = text.slice(0, at).split('\n').length
          offenders.push(`${file.slice(SRC_DIR.length)}:${line} -> ${marker}`)
        }
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    'Tambahkan `brandId: user.brandId` ke `.values(...)` insert di atas.',
  )
})

test('user baru hanya dibuat lewat createUserWithBrand', () => {
  const offenders = listFiles(SRC_DIR)
    .filter((file) => !file.endsWith('brand-queries.ts'))
    .flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, index) => ({ line, no: index + 1 }))
        .filter(({ line }) => line.includes('.insert(users)'))
        .map(({ no }) => `${file.slice(SRC_DIR.length)}:${no}`),
    )

  assert.deepEqual(
    offenders,
    [],
    'Pakai `createUserWithBrand()` dari lib/brand-queries.ts supaya brand ikut dibuat.',
  )
})

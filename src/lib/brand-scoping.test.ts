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
const SCOPED_BY_BRAND = ['feeRules', 'paymentMethods', 'customers']

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
  const pattern = new RegExp(`\\b(${SCOPED_BY_BRAND.join('|')})\\.userId\\b`)

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

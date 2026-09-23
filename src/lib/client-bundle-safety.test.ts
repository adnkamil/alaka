import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

/**
 * Penjaga bundle client.
 *
 * Modul server function di-import langsung oleh halaman/komponen client
 * (lihat `src/routeTree.gen.ts`). Waktu build, TanStack Start cuma membuang
 * import yang dipakai DI DALAM handler server function. Jadi kalau ada kode
 * yang menyentuh `db` di luar handler — mis. `export function` biasa di file
 * `*-functions.ts` — import `db`-nya ikut ke bundle browser. Rantainya:
 * `src/db` -> `drizzle-orm/node-postgres` -> `pg` -> `events`, dan app-nya
 * mati dengan error "Cannot access events.EventEmitter in client code"
 * (tombol/klik berhenti jalan karena React gagal hydrate).
 *
 * Aturannya: query yang butuh `db` taruh di file `*-queries.ts` (server-only),
 * dan jangan pernah import `src/db` dari halaman/komponen.
 */

const SRC_DIR = fileURLToPath(new URL('..', import.meta.url))

function listFiles(dir: string): Array<string> {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return listFiles(path)
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : []
  })
}

// `from '../db'`, `from '../../../../db'`, atau alias `from '#/db'`.
const DB_IMPORT_PATTERN = /from\s+'(?:#|(?:\.\.\/)+)db'/

test('file server function tidak mengekspor fungsi biasa yang ikut ke client', () => {
  const offenders = listFiles(join(SRC_DIR, 'lib'))
    .filter((file) => file.endsWith('-functions.ts'))
    .flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, index) => ({ line: line.trim(), no: index + 1 }))
        .filter(({ line }) => /^export (async )?function /.test(line))
        .map(
          ({ line, no }) => `${file.slice(SRC_DIR.length)}:${no} -> ${line}`,
        ),
    )

  assert.deepEqual(
    offenders,
    [],
    'Pindahkan fungsi (dan query `db`-nya) ke file `*-queries.ts` supaya tidak menarik `pg`/`events` ke bundle browser.',
  )
})

test('halaman & komponen client tidak meng-import koneksi db', () => {
  const clientFiles = [
    ...listFiles(join(SRC_DIR, 'components')),
    // Route di bawah `routes/api` cuma jalan di server (dibuang dari bundle client).
    ...listFiles(join(SRC_DIR, 'routes')).filter(
      (file) => !file.includes(`${join('routes', 'api')}`),
    ),
  ]

  const offenders = clientFiles
    .filter((file) => DB_IMPORT_PATTERN.test(readFileSync(file, 'utf8')))
    .map((file) => file.slice(SRC_DIR.length))

  assert.deepEqual(offenders, [])
})

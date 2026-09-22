// Tandai migrasi baseline sebagai "sudah dijalankan" untuk database yang
// skemanya sudah ada duluan (dibuat lewat `pnpm db:push` sebelum folder
// `drizzle/` dipakai). Tanpa langkah ini `pnpm db:migrate` akan mencoba
// membuat ulang tabel-tabel lama dan gagal — padahal data user tidak boleh
// tersentuh.
//
// Cara kerjanya sama persis dengan migrator drizzle: catat SATU baris di
// `drizzle.__drizzle_migrations` berisi sha256 dari file SQL migrasi tersebut
// + `created_at` = `when` di `drizzle/meta/_journal.json`. Migrasi dengan
// `when` lebih kecil/sama akan dilewati.
//
// Idempotent — aman dijalankan berkali-kali.
//
//   pnpm exec tsx scripts/drizzle-baseline.ts
//     -> tandai migrasi PERTAMA (baseline) sebagai applied (default).
//   pnpm exec tsx scripts/drizzle-baseline.ts --tag=0000_greedy_thing
//     -> tandai migrasi tertentu sebagai applied.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { config } from 'dotenv'
import { Client } from 'pg'

config({ path: ['.env.local', '.env'] })

const MIGRATIONS_FOLDER = 'drizzle'
const MIGRATIONS_SCHEMA = 'drizzle'
const MIGRATIONS_TABLE = '__drizzle_migrations'

interface JournalEntry {
  idx: number
  when: number
  tag: string
}

function readJournal(): Array<JournalEntry> {
  const raw = readFileSync(`${MIGRATIONS_FOLDER}/meta/_journal.json`).toString()
  return (JSON.parse(raw) as { entries: Array<JournalEntry> }).entries
}

// Sama seperti readMigrationFiles() di drizzle-orm: hash dihitung dari isi file
// mentah (utuh, termasuk komentar), bukan per-statement.
function hashOfMigration(tag: string) {
  const sql = readFileSync(`${MIGRATIONS_FOLDER}/${tag}.sql`).toString()
  return createHash('sha256').update(sql).digest('hex')
}

function resolveTargetTag(entries: Array<JournalEntry>) {
  const arg = process.argv.find((value) => value.startsWith('--tag='))
  const tag = arg?.slice('--tag='.length)
  if (tag) {
    const found = entries.find((entry) => entry.tag === tag)
    if (!found) throw new Error(`Tag migrasi "${tag}" tidak ada di journal`)
    return found
  }
  return entries[0]
}

async function main() {
  const entries = readJournal()
  const target = resolveTargetTag(entries)
  if (!target) throw new Error('Journal migrasi kosong')

  const hash = hashOfMigration(target.tag)
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  await client.query(`create schema if not exists "${MIGRATIONS_SCHEMA}"`)
  await client.query(
    `create table if not exists "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" (
       id serial primary key,
       hash text not null,
       created_at bigint
     )`,
  )

  const existing = await client.query(
    `select id, hash, created_at from "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}"
     where created_at = $1`,
    [target.when],
  )

  if (existing.rowCount && existing.rowCount > 0) {
    console.log(
      `↷ Baseline ${target.tag} sudah tercatat sebagai applied — tidak ada yang diubah.`,
    )
  } else {
    await client.query(
      `insert into "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" ("hash", "created_at") values ($1, $2)`,
      [hash, target.when],
    )
    console.log(
      `✓ Baseline ${target.tag} ditandai applied (created_at=${target.when}).`,
    )
  }

  const rows = await client.query(
    `select id, left(hash, 12) as hash, created_at from "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}" order by created_at`,
  )
  console.log(`Isi ${MIGRATIONS_SCHEMA}.${MIGRATIONS_TABLE}:`)
  console.table(rows.rows)

  // Yang dibandingkan adalah migrasi TERAKHIR yang tercatat di database (bukan
  // cuma baseline yang baru ditandai), supaya pesannya tidak menyesatkan kalau
  // migrasi setelahnya sudah pernah dijalankan.
  const lastApplied = Number(rows.rows.at(-1)?.created_at ?? 0)
  const pending = entries.filter((entry) => entry.when > lastApplied)
  console.log(
    pending.length > 0
      ? `Belum dijalankan — \`pnpm db:migrate\` akan menerapkan: ${pending
          .map((entry) => entry.tag)
          .join(', ')}`
      : 'Semua migrasi di journal sudah applied. Tidak ada yang perlu dijalankan.',
  )

  await client.end()
}

main().catch((error: unknown) => {
  console.log('FAIL:', error instanceof Error ? error.message : error)
  process.exit(1)
})

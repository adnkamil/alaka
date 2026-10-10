// TAHAP 2 (backfill) migrasi ke tabel `brands`.
//
// Untuk setiap user yang belum punya brand: buat satu brand (UUID baru) yang
// menyalin nama brand, template pesan, dan masa trial dari baris user, lalu isi
// `users.brand_id`. Setelah itu `brand_id` di tabel data diisi dari brand
// pemilik `user_id`-nya. Kolom lama di `users` TIDAK diubah/dihapus.
//
// `brands.avatar_updated_at` sengaja dibiarkan kosong: foto di Netlify Blobs
// masih memakai key id user, jadi brand tampil tanpa foto sampai tahap
// "switch baca" dan user mengunggah ulang.
//
// Aman dijalankan berulang (idempotent): yang sudah punya brand/brand_id dilewati.
// Sekali jalan = satu transaksi; kalau ada cek yang gagal, semuanya di-rollback.
//
//   pnpm db:backfill-brands                  -> DRY-RUN (default): jalankan semua
//                                               langkah + cek, lalu ROLLBACK.
//   pnpm db:backfill-brands --apply          -> tulis sungguhan (COMMIT).
//   pnpm db:backfill-brands --verify         -> hanya cek konsistensi (read-only).
//   pnpm db:backfill-brands:neon [--apply|--verify]
//                                            -> sama, tapi ke DB di .env.neon.local.
//
// Jalankan lagi (--apply) setelah kode baru dideploy untuk menangkap user yang
// mendaftar di antara backfill pertama dan deploy.
import { config } from 'dotenv'
import { Client } from 'pg'

config({ path: ['.env.local', '.env'] })

const DATA_TABLES = [
  'fee_rules',
  'customers',
  'payment_methods',
  'events',
  'subscriptions',
  'activity_logs',
] as const

const ADVISORY_LOCK_KEY = 727001

function readFlag(name: string) {
  return process.argv.includes(`--${name}`)
}

function describeTarget(url: string | undefined) {
  if (!url) throw new Error('DATABASE_URL belum diatur')
  const parsed = new URL(url)
  const port = parsed.port ? `:${parsed.port}` : ''
  return `${parsed.hostname}${port}${parsed.pathname}`
}

async function count(client: Client, sql: string) {
  const result = await client.query<{ n: string }>(sql)
  return Number(result.rows[0]?.n ?? 0)
}

async function runChecks(client: Client) {
  const checks: { cek: string; bermasalah: number }[] = []

  checks.push({
    cek: 'users tanpa brand_id',
    bermasalah: await count(
      client,
      'select count(*) n from users where brand_id is null',
    ),
  })

  for (const table of DATA_TABLES) {
    checks.push({
      cek: `${table}: brand_id kosong padahal user_id ada`,
      bermasalah: await count(
        client,
        `select count(*) n from ${table} where brand_id is null and user_id is not null`,
      ),
    })
    checks.push({
      cek: `${table}: brand_id beda dengan brand milik user_id`,
      bermasalah: await count(
        client,
        `select count(*) n from ${table} x
         join users u on u.id = x.user_id
         where x.brand_id is distinct from u.brand_id`,
      ),
    })
  }

  checks.push({
    cek: 'brands yang tidak punya user',
    bermasalah: await count(
      client,
      `select count(*) n from brands b
       where not exists (select 1 from users u where u.brand_id = b.id)`,
    ),
  })

  return checks
}

async function main() {
  const apply = readFlag('apply')
  const verifyOnly = readFlag('verify')
  if (apply && verifyOnly) {
    throw new Error('Pilih salah satu: --apply atau --verify')
  }

  const target = describeTarget(process.env.DATABASE_URL)
  const mode = verifyOnly ? 'VERIFY (read-only)' : apply ? 'APPLY' : 'DRY-RUN'
  console.log(`Target DB : ${target}`)
  console.log(`Mode      : ${mode}`)

  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  try {
    const brandsTable = await client.query<{ t: string | null }>(
      `select to_regclass('public.brands') as t`,
    )
    if (!brandsTable.rows[0]?.t) {
      throw new Error(
        'Tabel brands belum ada. Jalankan migrasi 0011 (db:migrate) dulu.',
      )
    }

    await client.query(verifyOnly ? 'begin read only' : 'begin')
    // Kalau ada kunci yang tidak terlepas, gagal cepat — jangan menahan trafik prod.
    await client.query(`set local lock_timeout = '5s'`)
    await client.query(`set local statement_timeout = '60s'`)

    if (!verifyOnly) {
      await client.query('select pg_advisory_xact_lock($1)', [
        ADVISORY_LOCK_KEY,
      ])

      const pending = await client.query(
        `select email, brand_name, trial_started_at, trial_ends_at
         from users where brand_id is null order by created_at`,
      )
      console.log(`\nUser yang belum punya brand: ${pending.rowCount}`)
      if (pending.rowCount) console.table(pending.rows.slice(0, 20))
      if ((pending.rowCount ?? 0) > 20) {
        console.log(`... dan ${(pending.rowCount ?? 0) - 20} lainnya`)
      }

      // Id brand dibuat di CTE `src` supaya pasangan user -> brand diketahui
      // tanpa tabel perantara. CTE `ins` tetap dieksekusi walau tidak dirujuk.
      const created = await client.query(
        `with src as (
           select u.id as user_id, gen_random_uuid() as brand_id,
                  u.brand_name, u.wa_message_template,
                  u.trial_started_at, u.trial_ends_at, u.created_at
           from users u
           where u.brand_id is null
         ), ins as (
           insert into brands
             (id, name, wa_message_template,
              trial_started_at, trial_ends_at, created_at, updated_at)
           select brand_id, brand_name, wa_message_template,
                  trial_started_at, trial_ends_at, created_at, now()
           from src
           returning id
         )
         update users u set brand_id = s.brand_id
         from src s
         where u.id = s.user_id`,
      )
      console.log(`\nBrand dibuat & users di-update: ${created.rowCount}`)

      for (const table of DATA_TABLES) {
        const updated = await client.query(
          `update ${table} t set brand_id = u.brand_id
           from users u
           where t.user_id = u.id
             and t.brand_id is null
             and u.brand_id is not null`,
        )
        console.log(`  ${table.padEnd(16)} brand_id diisi: ${updated.rowCount}`)
      }
    }

    const checks = await runChecks(client)
    console.log('\nHasil cek (kolom "bermasalah" harus 0 semua):')
    console.table(
      checks.map((c) => ({
        ...c,
        status: c.bermasalah === 0 ? 'OK' : 'GAGAL',
      })),
    )

    const failed = checks.filter((c) => c.bermasalah !== 0)
    if (failed.length > 0) {
      throw new Error(
        verifyOnly
          ? `${failed.length} cek gagal — data belum konsisten (jalankan --apply).`
          : `${failed.length} cek gagal — semua perubahan di-rollback.`,
      )
    }

    if (apply) {
      await client.query('commit')
      console.log('Selesai: perubahan DITULIS (commit).')
    } else {
      await client.query('rollback')
      console.log(
        verifyOnly
          ? 'Selesai: data konsisten (read-only, tidak ada perubahan).'
          : 'DRY-RUN: semua langkah & cek lolos, lalu di-ROLLBACK. Tidak ada yang tertulis.\nJalankan lagi dengan --apply untuk menulis.',
      )
    }
  } catch (error) {
    await client.query('rollback').catch(() => undefined)
    throw error
  } finally {
    await client.end()
  }
}

main().catch((error: unknown) => {
  console.log('FAIL:', error instanceof Error ? error.message : error)
  process.exit(1)
})

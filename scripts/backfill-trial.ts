// Atur masa trial user. Dipakai kalau pemilik aplikasi mau MENGECUALIKAN user
// lama dari aturan "trial mulai saat user dibuat" — mis. memberi trial 30 hari
// baru mulai hari ini saat fitur langganan dirilis, supaya user lama tidak
// langsung masuk FREE.
//
// Defaultnya (`--from=created`) nilai yang dipasang sama dengan yang dikerjakan
// migrasi `0001_curious_blade.sql`, jadi jalankan tanpa opsi = aman/no-op.
//
//   pnpm exec tsx scripts/backfill-trial.ts --from=now
//     -> semua user: trial 30 hari mulai sekarang.
//   pnpm exec tsx scripts/backfill-trial.ts --from=now --days=7
//     -> semua user: trial 7 hari mulai sekarang.
//   pnpm exec tsx scripts/backfill-trial.ts --email=kamu@email.com --from=now
//     -> cuma user tertentu.
//   pnpm exec tsx scripts/backfill-trial.ts --email=kamu@email.com --from=now --days=0
//     -> trial langsung habis (buat ngetes tampilan FREE).
//   pnpm exec tsx scripts/backfill-trial.ts --dry-run
//     -> cuma lihat rencana perubahan, tidak menulis.
import { config } from 'dotenv'
import { Client } from 'pg'

config({ path: ['.env.local', '.env'] })

const DEFAULT_DAYS = 30

function readArg(name: string) {
  const prefix = `--${name}=`
  const value = process.argv.find((arg) => arg.startsWith(prefix))
  return value?.slice(prefix.length)
}

function readFlag(name: string) {
  return process.argv.includes(`--${name}`)
}

async function main() {
  const from = readArg('from') ?? 'created'
  if (from !== 'created' && from !== 'now') {
    throw new Error('Nilai --from harus "created" atau "now"')
  }

  const days = readArg('days') ? Number(readArg('days')) : DEFAULT_DAYS
  if (!Number.isInteger(days) || days < 0) {
    throw new Error('Nilai --days harus bilangan bulat >= 0')
  }

  const email = readArg('email')
  const dryRun = readFlag('dry-run')

  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()

  const plan = await client.query(
    `select id, email, created_at, trial_started_at, trial_ends_at
     from users
     ${email ? 'where email = $1' : ''}
     order by created_at`,
    email ? [email] : [],
  )

  if (plan.rowCount === 0) {
    console.log('Tidak ada user yang cocok.')
    await client.end()
    return
  }

  console.log(
    `Rencana (from=${from}, days=${days}${email ? `, email=${email}` : ''}):`,
  )
  console.table(
    plan.rows.map((row) => ({
      email: row.email,
      created_at: row.created_at,
      trial_started_at: row.trial_started_at,
      trial_ends_at: row.trial_ends_at,
      'trial_started_at (baru)': from === 'now' ? '<sekarang>' : row.created_at,
      'trial_ends_at (baru)':
        from === 'now'
          ? `<sekarang + ${days} hari>`
          : `<created_at + ${days} hari>`,
    })),
  )

  if (dryRun) {
    console.log('--dry-run: tidak ada perubahan yang ditulis.')
    await client.end()
    return
  }

  // `base` cuma boleh 'now()' atau 'created_at' (sudah divalidasi di atas), jadi
  // aman diinterpolasi. Jumlah hari dikirim sebagai parameter.
  const base = from === 'now' ? 'now()' : 'created_at'
  const result = await client.query(
    `update users
     set trial_started_at = ${base},
         trial_ends_at = ${base} + interval '1 day' * $1::int,
         updated_at = now()
     ${email ? 'where email = $2' : ''}`,
    email ? [days, email] : [days],
  )

  console.log(`Selesai. ${result.rowCount} baris user di-update.`)

  const after = await client.query(
    `select email, trial_started_at, trial_ends_at
     from users
     ${email ? 'where email = $1' : ''}
     order by created_at`,
    email ? [email] : [],
  )
  console.table(after.rows)

  await client.end()
}

main().catch((error: unknown) => {
  console.log('FAIL:', error instanceof Error ? error.message : error)
  process.exit(1)
})

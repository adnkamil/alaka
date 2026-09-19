// Migrasi satu kali: pindahkan data pembayaran lama di tabel `users`
// (bank_name / bank_account_number / qris_image) ke tabel `payment_methods`.
//
// Aman dijalankan berulang: baris bank/qris hanya dibuat kalau user itu belum
// punya metode dengan tipe yang sama.
//
//   pnpm exec tsx scripts/migrate-payment-methods.ts
import { config } from 'dotenv'
import { Client } from 'pg'

config({ path: ['.env.local', '.env'] })

const client = new Client({ connectionString: process.env.DATABASE_URL })

async function main() {
  await client.connect()

  const before = await client.query(
    'select count(*)::int as c from payment_methods',
  )
  console.log('payment_methods sebelum migrasi:', before.rows[0].c)

  const legacy = await client.query(
    "select count(*)::int as bank from users where coalesce(bank_name,'') <> '' and coalesce(bank_account_number,'') <> ''",
  )
  const legacyQris = await client.query(
    'select count(*)::int as qris from users where qris_image is not null',
  )
  console.log(
    'data lama: bank =',
    legacy.rows[0].bank,
    '| qris =',
    legacyQris.rows[0].qris,
  )

  const bank = await client.query(
    `insert into payment_methods (user_id, type, provider, account_number, is_active)
     select u.id, 'bank', coalesce(nullif(u.bank_name, ''), 'Bank'), u.bank_account_number, true
     from users u
     where (
         coalesce(u.bank_name, '') <> ''
         or coalesce(u.bank_account_number, '') <> ''
       )
       and not exists (
         select 1 from payment_methods pm
         where pm.user_id = u.id and pm.type = 'bank'
       )
     returning id`,
  )
  console.log('baris bank dibuat:', bank.rowCount)

  const qris = await client.query(
    `insert into payment_methods (user_id, type, provider, qris_image, is_active)
     select u.id, 'qris', 'QRIS', u.qris_image, true
     from users u
     where u.qris_image is not null
       and not exists (
         select 1 from payment_methods pm
         where pm.user_id = u.id and pm.type = 'qris'
       )
     returning id`,
  )
  console.log('baris qris dibuat:', qris.rowCount)

  const rows = await client.query(
    `select pm.id, pm.type, pm.provider, pm.account_number, pm.is_active,
            (pm.qris_image is not null) as has_qris, u.email
     from payment_methods pm
     join users u on u.id = pm.user_id
     order by pm.type, pm.created_at`,
  )
  console.log('isi payment_methods sekarang:')
  console.table(rows.rows)

  await client.end()
}

main().catch(async (e) => {
  console.log('FAIL:', e.message)
  process.exit(1)
})

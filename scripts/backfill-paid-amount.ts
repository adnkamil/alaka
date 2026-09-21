// Backfill satu kali: isi `paid_amount` buat pesanan LAMA (dari sebelum fitur
// DP ada) yang statusnya paid/shipped tapi paid_amount-nya masih 0 (default).
// Tanpa ini, "Uang Masuk" di Keuangan/detail event bakal kebaca 0 buat semua
// pesanan lama, walaupun badge status-nya udah "Lunas"/"Dikirim".
//
// Cara pakai: pnpm tsx scripts/backfill-paid-amount.ts

import { config } from 'dotenv'
config({ path: ['.env.local', '.env'] })

async function main() {
  const { eq, inArray } = await import('drizzle-orm')
  const { db } = await import('../src/db')
  const { orders } = await import('../src/db/schema')
  const { summarizeItems } = await import('../src/lib/order-totals')

  const candidates = await db.query.orders.findMany({
    where: inArray(orders.paymentStatus, ['paid', 'shipped']),
    with: { items: true },
  })

  let updated = 0
  let skipped = 0

  for (const order of candidates) {
    if (Number(order.paidAmount) > 0) {
      skipped++
      continue // udah ada isinya (order baru / udah pernah di-backfill), lewati
    }

    const total = summarizeItems(order.items).total
    if (total <= 0) {
      skipped++
      continue
    }

    await db
      .update(orders)
      .set({ paidAmount: total.toString() })
      .where(eq(orders.id, order.id))

    updated++
  }

  console.log(
    `Selesai. ${updated} pesanan di-backfill, ${skipped} dilewati (sudah ada nilai atau tidak perlu).`,
  )
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
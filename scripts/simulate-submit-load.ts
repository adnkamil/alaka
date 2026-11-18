// Simulasi beban submit jastiper TANPA perlu data asli dan TANPA banyak orang.
//
// Skrip ini membuat data uji sementara (event + pesanan + barang draft, diberi
// nama "__loadtest__"), menjalankan submit untuk semua event itu SEKALIGUS,
// mengukur waktu dan jumlah perintah ke database, lalu menghapus data uji.
// Sebelum di-rollback, hasil tiap submit diperiksa: jumlah barang berstatus
// pengajuan, tidak ada draft tersisa, nomor submit, dan isi log status.
// Transaksi submit di-ROLLBACK, jadi data uji tetap draft dan bisa diulang.
//
// HANYA UNTUK STAGING. Skrip menulis data uji ke database, jadi wajib:
//   CONFIRM_STAGING=yes
//
// Contoh:
//   CONFIRM_STAGING=yes pnpm perf:submit:stg --events 100 --rows 20
//   CONFIRM_STAGING=yes pnpm perf:submit:stg --events 100 --rows 20 --legacy
//
// Opsi:
//   --events N   jumlah jastiper yang submit bersamaan (default 50)
//   --rows N     jumlah baris barang per jastiper (default 20)
//   --legacy     pakai pola lama (update + log per baris) sebagai pembanding
//   POOL_MAX=N   ukuran pool koneksi skrip ini (default 10, sama seperti app)

import { Pool } from 'pg'

class RollbackSignal extends Error {}
const TEST_PREFIX = '__loadtest__'

function numArg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1) return fallback
  const v = Number(process.argv[i + 1])
  if (!Number.isInteger(v) || v < 1) {
    throw new Error(`--${name} harus bilangan bulat positif`)
  }
  return v
}

function pct(sorted: Array<number>, p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.min(sorted.length - 1, Math.max(0, idx))]
}

async function main() {
  if (process.env.CONFIRM_STAGING !== 'yes') {
    throw new Error(
      'Skrip ini menulis data uji ke database dan hanya untuk staging. Set CONFIRM_STAGING=yes untuk melanjutkan.',
    )
  }
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL belum diset.')
  console.log(`Database: ${new URL(url).host}`)
  console.log('Pastikan ini database STAGING, bukan produksi.')

  const { drizzle } = await import('drizzle-orm/node-postgres')
  const { and, asc, eq, isNull, like, sql } = await import('drizzle-orm')
  const schema = await import('../src/db/schema')
  const { submitEventOrders } = await import('../src/lib/submit-queries')
  const { nextSubmitNo } = await import('../src/lib/submit-status')
  const { chunk } = await import('../src/lib/chunk')
  const { brands, events, eventSubmissions, itemComponents, itemStatusLogs, items, orders } = schema

  let queryCount = 0
  const pool = new Pool({
    connectionString: url,
    max: Number(process.env.POOL_MAX ?? 10),
  })
  const db = drizzle(pool, {
    schema,
    logger: { logQuery: () => void queryCount++ },
  })

  const eventCount = numArg('events', 50)
  const rowsPerEvent = numArg('rows', 20)
  const legacy = process.argv.includes('--legacy')
  const customersPerEvent = Math.max(1, Math.min(10, rowsPerEvent))

  const cleanup = async () => {
    await db.delete(events).where(like(events.name, `${TEST_PREFIX}%`))
  }

  // Pola lama untuk pembanding: query yang sama, tapi update + log per baris.
  async function submitLegacy(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    eventId: string,
    now: Date,
  ) {
    const draftItems = await tx
      .select({ id: items.id, qty: items.qty })
      .from(items)
      .innerJoin(orders, eq(orders.id, items.orderId))
      .where(and(eq(orders.eventId, eventId), eq(items.isBundle, false), isNull(items.submitStatus)))
      .orderBy(asc(items.createdAt), asc(items.id))
    const draftComps = await tx
      .select({ id: itemComponents.id, qty: itemComponents.qty })
      .from(itemComponents)
      .innerJoin(items, eq(items.id, itemComponents.itemId))
      .innerJoin(orders, eq(orders.id, items.orderId))
      .where(and(eq(orders.eventId, eventId), isNull(itemComponents.submitStatus)))
    const existing = await tx
      .select({ submitNo: eventSubmissions.submitNo })
      .from(eventSubmissions)
      .where(eq(eventSubmissions.eventId, eventId))
    const [submission] = await tx
      .insert(eventSubmissions)
      .values({ eventId, submitNo: nextSubmitNo(existing.map((r) => r.submitNo)), submittedAt: now })
      .returning({ id: eventSubmissions.id })
    for (const row of draftItems) {
      await tx
        .update(items)
        .set({ submitStatus: 'pengajuan', submissionId: submission.id })
        .where(eq(items.id, row.id))
      await tx.insert(itemStatusLogs).values({
        eventId,
        itemId: row.id,
        submissionId: submission.id,
        fromStatus: null,
        toStatus: 'pengajuan',
        qty: row.qty,
      })
    }
    void draftComps
  }

  // Pemeriksaan hasil: tepat 3 query per submit (dikurangkan dari hitungan perintah).
  const VERIFY_QUERIES = 3
  const mismatches: Array<string> = []
  async function verifySubmit(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    eventId: string,
    expectedRows: number,
  ) {
    const [subs] = await tx
      .select({
        n: sql<number>`count(*)::int`,
        first: sql<number>`coalesce(min(${eventSubmissions.submitNo}), 0)::int`,
        id: sql<string>`min(${eventSubmissions.id}::text)`,
      })
      .from(eventSubmissions)
      .where(eq(eventSubmissions.eventId, eventId))
    const submissionId = subs.id
    const [it] = await tx
      .select({
        sent: sql<number>`count(*) filter (where ${items.submitStatus} = 'pengajuan' and ${items.submissionId}::text = ${submissionId})::int`,
        draft: sql<number>`count(*) filter (where ${items.submitStatus} is null)::int`,
      })
      .from(items)
      .innerJoin(orders, eq(orders.id, items.orderId))
      .where(eq(orders.eventId, eventId))
    const [lg] = await tx
      .select({
        n: sql<number>`count(*)::int`,
        valid: sql<number>`count(*) filter (where ${itemStatusLogs.toStatus} = 'pengajuan' and ${itemStatusLogs.fromStatus} is null)::int`,
        qty: sql<number>`coalesce(sum(${itemStatusLogs.qty}), 0)::int`,
      })
      .from(itemStatusLogs)
      .where(sql`${itemStatusLogs.submissionId}::text = ${submissionId}`)

    const problems: Array<string> = []
    if (subs.n !== 1) problems.push(`catatan submit ${subs.n} (harus 1)`)
    if (subs.first !== 1) problems.push(`nomor submit ${subs.first} (harus 1)`)
    if (it.sent !== expectedRows) problems.push(`barang berstatus pengajuan ${it.sent} (harus ${expectedRows})`)
    if (it.draft !== 0) problems.push(`barang masih draft ${it.draft} (harus 0)`)
    if (lg.n !== expectedRows) problems.push(`jumlah log ${lg.n} (harus ${expectedRows})`)
    if (lg.valid !== expectedRows) problems.push(`log valid ${lg.valid} (harus ${expectedRows})`)
    if (lg.qty !== expectedRows) problems.push(`total qty log ${lg.qty} (harus ${expectedRows})`)
    if (problems.length > 0) mismatches.push(`event ${eventId}: ${problems.join('; ')}`)
  }

  try {
    await cleanup() // sisa dari proses yang pernah terhenti

    const [brand] = await db.select({ id: brands.id }).from(brands).limit(1)
    if (!brand) throw new Error('Tidak ada brand di database. Buat satu jastiper dulu di staging.')

    console.log(`Menyiapkan data uji: ${eventCount} jastiper x ${rowsPerEvent} baris...`)
    const eventRows = await db
      .insert(events)
      .values(
        Array.from({ length: eventCount }, (_, i) => ({
          brandId: brand.id,
          name: `${TEST_PREFIX}${i + 1}`,
          eventDate: new Date(),
        })),
      )
      .returning({ id: events.id })

    const orderValues = eventRows.flatMap((e) =>
      Array.from({ length: customersPerEvent }, (_, c) => ({
        eventId: e.id,
        customerName: `Pembeli uji ${c + 1}`,
      })),
    )
    const orderRows: Array<{ id: string; eventId: string }> = []
    for (const part of chunk(orderValues, 500)) {
      orderRows.push(...(await db.insert(orders).values(part).returning({ id: orders.id, eventId: orders.eventId })))
    }
    const ordersByEvent = new Map<string, Array<string>>()
    for (const o of orderRows) {
      ordersByEvent.set(o.eventId, [...(ordersByEvent.get(o.eventId) ?? []), o.id])
    }
    const itemValues = eventRows.flatMap((e) => {
      const orderIds = ordersByEvent.get(e.id) ?? []
      return Array.from({ length: rowsPerEvent }, (_, r) => ({
        orderId: orderIds[r % orderIds.length],
        name: `Barang uji ${r + 1}`,
        originalPrice: '10000',
        fee: '1000',
        qty: 1,
      }))
    })
    for (const part of chunk(itemValues, 500)) {
      await db.insert(items).values(part)
    }

    console.log(
      `Menjalankan ${eventRows.length} submit bersamaan (${legacy ? 'pola LAMA' : 'kode saat ini'}), pool ${pool.options.max}...`,
    )
    queryCount = 0
    const durations: Array<number> = []
    let failed = 0
    const wallStart = performance.now()

    await Promise.all(
      eventRows.map(async ({ id: eventId }) => {
        const t0 = performance.now()
        try {
          await db.transaction(async (tx) => {
            // Sama seperti handler: kunci baris event dulu.
            await tx.select({ id: events.id }).from(events).where(eq(events.id, eventId)).for('update')
            if (legacy) await submitLegacy(tx, eventId, new Date())
            else await submitEventOrders(tx as never, eventId, new Date())
            await verifySubmit(tx, eventId, rowsPerEvent)
            throw new RollbackSignal()
          })
        } catch (err) {
          if (!(err instanceof RollbackSignal)) {
            failed++
            console.error(`Gagal event ${eventId}:`, err instanceof Error ? err.message : err)
          }
        }
        durations.push(performance.now() - t0)
      }),
    )

    const wall = performance.now() - wallStart
    const totalQueries = queryCount - VERIFY_QUERIES * eventRows.length
    durations.sort((a, b) => a - b)
    console.log('--- Hasil ---')
    console.log(`Mode: ${legacy ? 'pola lama (pembanding)' : 'kode saat ini'}`)
    console.log(`Berhasil: ${eventRows.length - failed}, gagal: ${failed}`)
    console.log(`Waktu total: ${(wall / 1000).toFixed(2)} dtk`)
    console.log(
      `Per submit (termasuk menunggu koneksi): p50 ${pct(durations, 50).toFixed(0)} ms, p95 ${pct(durations, 95).toFixed(0)} ms, maks ${pct(durations, 100).toFixed(0)} ms`,
    )
    console.log(
      `Perintah ke database: ${totalQueries} total, rata-rata ${(totalQueries / eventRows.length).toFixed(1)} per submit (tanpa query pemeriksaan)`,
    )
    if (mismatches.length === 0 && failed === 0) {
      console.log(`Pemeriksaan hasil: OK untuk ${eventRows.length} dari ${eventRows.length} submit`)
    } else {
      console.log(`Pemeriksaan hasil: ${mismatches.length} submit TIDAK SESUAI`)
      for (const m of mismatches.slice(0, 5)) console.log(`  - ${m}`)
      process.exitCode = 1
    }
  } finally {
    await cleanup()
    await pool.end()
    console.log('Data uji sudah dihapus.')
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})

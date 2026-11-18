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
//
// Mode review (mengukur reviewSubmission, yang dipakai cek stok otomatis):
//   CONFIRM_STAGING=yes pnpm perf:submit:stg --review --events 50 --rows 100
//   --review         submit dulu (di-commit, tidak diukur), lalu ukur
//                    reviewSubmission per submit. Tiap review di-ROLLBACK.
//   --concurrency N  jumlah review berjalan bersamaan (default 1, seperti
//                    pengecekan otomatis yang memproses satu per satu)
//   --variants N     jumlah varian partner uji yang dipakai bergiliran (default 20)
//   Campuran keputusan per baris (qty 4): 70% disetujui penuh, 20% sebagian
//   (2 dari 4, baris dipecah), 10% ditolak penuh. Belum mencakup paket.

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
  const { and, asc, eq, inArray, isNull, like, sql } = await import('drizzle-orm')
  const schema = await import('../src/db/schema')
  const { reviewSubmission, submitEventOrders } = await import('../src/lib/submit-queries')
  const { nextSubmitNo } = await import('../src/lib/submit-status')
  const { chunk } = await import('../src/lib/chunk')
  const {
    brands,
    events,
    eventSubmissions,
    itemComponents,
    itemStatusLogs,
    items,
    notifications,
    orders,
    partnerProducts,
    partnerVariants,
    partners,
  } = schema

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
  const review = process.argv.includes('--review')
  if (review && legacy) throw new Error('--review tidak bisa dipakai bersama --legacy.')
  // --compare: jalankan reviewSubmission versi LAMA dan versi sekarang pada data
  // yang sama, lalu bandingkan hasil akhirnya. Versi lama harus disalin dulu dari
  // git (sementara, jangan di-commit):
  //   git show <commit-lama>:src/lib/submit-queries.ts > src/lib/__old-submit-queries.ts
  // --bundles N menambah N paket (2 komponen) per event.
  const compare = process.argv.includes('--compare')
  const bundlesPerEvent = process.argv.includes('--bundles') ? numArg('bundles', 1) : 0
  if (compare && !review) throw new Error('--compare hanya dipakai bersama --review.')
  if (bundlesPerEvent > 0 && !compare) {
    throw new Error('--bundles hanya dipakai bersama --compare (pemeriksaan paket dilakukan lewat perbandingan).')
  }
  const reviewConcurrency = numArg('concurrency', 1)
  const variantCount = numArg('variants', 20)
  const customersPerEvent = Math.max(1, Math.min(10, rowsPerEvent))

  // Mode review memakai barang qty 4 supaya persetujuan sebagian bisa terjadi.
  const REVIEW_QTY = 4
  const VARIANT_STOCK = 1_000_000

  const cleanup = async () => {
    // Hapus barang dulu (komponen ikut lewat cascade). Kalau event dihapus
    // lebih dulu, submission_id komponen berstatus pengajuan di-set null dan
    // melanggar constraint item_components_submit_pair.
    await db.delete(items).where(
      inArray(
        items.orderId,
        db
          .select({ id: orders.id })
          .from(orders)
          .innerJoin(events, eq(events.id, orders.eventId))
          .where(like(events.name, `${TEST_PREFIX}%`)),
      ),
    )
    await db.delete(events).where(like(events.name, `${TEST_PREFIX}%`))
    // Partner uji (produk dan varian ikut terhapus lewat cascade).
    await db.delete(partners).where(like(partners.email, `${TEST_PREFIX}%`))
  }

  /** Jalankan tugas dengan paling banyak `limit` yang aktif bersamaan. */
  async function runPool<T>(tasks: Array<T>, limit: number, fn: (t: T) => Promise<void>) {
    let next = 0
    await Promise.all(
      Array.from({ length: Math.min(limit, tasks.length) }, async () => {
        while (next < tasks.length) await fn(tasks[next++])
      }),
    )
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
    // Mode review: partner + produk + varian uji dengan stok besar, supaya
    // pengurangan stok di reviewSubmission ikut terukur tapi tidak pernah kurang.
    let variantIds: Array<string> = []
    let testProductId = ''
    if (review) {
      const [partner] = await db
        .insert(partners)
        .values({ name: `${TEST_PREFIX}partner`, email: `${TEST_PREFIX}partner@example.invalid` })
        .returning({ id: partners.id })
      const [product] = await db
        .insert(partnerProducts)
        .values({ partnerId: partner.id, name: 'Produk uji', hasVariants: false, price: '10000' })
        .returning({ id: partnerProducts.id })
      testProductId = product.id
      const variantRows = await db
        .insert(partnerVariants)
        .values(
          Array.from({ length: variantCount }, () => ({
            partnerProductId: product.id,
            price: '10000',
            trackStock: true,
            stockQty: VARIANT_STOCK,
          })),
        )
        .returning({ id: partnerVariants.id })
      variantIds = variantRows.map((v) => v.id)
    }

    const itemValues = eventRows.flatMap((e, ei) => {
      const orderIds = ordersByEvent.get(e.id) ?? []
      return Array.from({ length: rowsPerEvent }, (_, r) => ({
        orderId: orderIds[r % orderIds.length],
        name: `Barang uji ${r + 1}`,
        originalPrice: '10000',
        fee: '1000',
        qty: review ? REVIEW_QTY : 1,
        ...(review ? { partnerVariantId: variantIds[(ei + r) % variantIds.length] } : {}),
      }))
    })
    for (const part of chunk(itemValues, 500)) {
      await db.insert(items).values(part)
    }

    if (bundlesPerEvent > 0) {
      const bundleValues = eventRows.flatMap((e) => {
        const orderIds = ordersByEvent.get(e.id) ?? []
        return Array.from({ length: bundlesPerEvent }, (_, b) => ({
          orderId: orderIds[b % orderIds.length],
          name: `Paket uji ${b + 1}`,
          originalPrice: '20000',
          fee: '2000',
          qty: 1,
          isBundle: true,
        }))
      })
      const bundleIds: Array<string> = []
      for (const part of chunk(bundleValues, 500)) {
        bundleIds.push(...(await db.insert(items).values(part).returning({ id: items.id })).map((r) => r.id))
      }
      const compValues = bundleIds.flatMap((itemId, bi) =>
        [0, 1].map((k) => ({
          itemId,
          partnerVariantId: variantIds[(bi + k) % variantIds.length],
          productName: 'Produk uji',
          qty: 2,
        })),
      )
      for (const part of chunk(compValues, 500)) {
        await db.insert(itemComponents).values(part)
      }
    }

    if (review) {
      // Tahap 1 (tidak diukur): submit semua event dan COMMIT, supaya ada
      // baris 'pengajuan' yang bisa direview.
      console.log(`Submit ${eventRows.length} event (di-commit, tidak diukur)...`)
      await runPool(eventRows, Number(process.env.POOL_MAX ?? 10), async ({ id: eventId }) => {
        await db.transaction(async (tx) => {
          await submitEventOrders(tx as never, eventId, new Date())
        })
      })

      const submissions = await db
        .select({
          id: eventSubmissions.id,
          eventId: eventSubmissions.eventId,
          queueSeq: eventSubmissions.queueSeq,
        })
        .from(eventSubmissions)
        .innerJoin(events, eq(events.id, eventSubmissions.eventId))
        .where(like(events.name, `${TEST_PREFIX}%`))
        .orderBy(asc(eventSubmissions.queueSeq))
      const pendingBySubmission = new Map<string, Array<{ id: string; qty: number }>>()
      for (const part of chunk(
        submissions.map((s) => s.id),
        500,
      )) {
        const rows = await db
          .select({ id: items.id, qty: items.qty, submissionId: items.submissionId })
          .from(items)
          .where(and(inArray(items.submissionId, part), eq(items.submitStatus, 'pengajuan')))
          .orderBy(asc(items.id))
        for (const row of rows) {
          const list = pendingBySubmission.get(row.submissionId!) ?? []
          list.push({ id: row.id, qty: row.qty })
          pendingBySubmission.set(row.submissionId!, list)
        }
      }

      // Komponen paket yang menunggu cek (hanya terisi kalau --bundles).
      const compsBySubmission = new Map<string, Array<{ id: string; qty: number }>>()
      if (bundlesPerEvent > 0) {
        for (const part of chunk(
          submissions.map((s) => s.id),
          500,
        )) {
          const rows = await db
            .select({
              id: itemComponents.id,
              qty: itemComponents.qty,
              submissionId: itemComponents.submissionId,
            })
            .from(itemComponents)
            .where(
              and(
                inArray(itemComponents.submissionId, part),
                eq(itemComponents.submitStatus, 'pengajuan'),
              ),
            )
            .orderBy(asc(itemComponents.id))
          for (const row of rows) {
            const list = compsBySubmission.get(row.submissionId!) ?? []
            list.push({ id: row.id, qty: row.qty })
            compsBySubmission.set(row.submissionId!, list)
          }
        }
      }

      // Keputusan per baris: 70% penuh, 20% sebagian (2 dari 4), 10% ditolak.
      const decide = (i: number, qty: number) => {
        const m = i % 10
        if (m < 7) return qty
        if (m < 9) return Math.floor(qty / 2)
        return 0
      }

      // Cuplikan keadaan event setelah review, tanpa id, untuk perbandingan
      // versi lama dan baru. Query-nya tidak ikut dihitung (dihitung di luar).
      type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
      const snapshot = async (tx: Tx, submissionId: string, eventId: string) => {
        const itemRows = await tx
          .select({
            name: items.name,
            qty: items.qty,
            status: items.submitStatus,
            isBundle: items.isBundle,
            fee: items.fee,
            price: items.originalPrice,
            hpp: items.hpp,
            variant: items.partnerVariantId,
          })
          .from(items)
          .innerJoin(orders, eq(orders.id, items.orderId))
          .where(eq(orders.eventId, eventId))
        const compRows = await tx
          .select({
            bundle: items.name,
            product: itemComponents.productName,
            qty: itemComponents.qty,
            status: itemComponents.submitStatus,
            variant: itemComponents.partnerVariantId,
          })
          .from(itemComponents)
          .innerJoin(items, eq(items.id, itemComponents.itemId))
          .innerJoin(orders, eq(orders.id, items.orderId))
          .where(eq(orders.eventId, eventId))
        const logRows = await tx
          .select({
            from: itemStatusLogs.fromStatus,
            to: itemStatusLogs.toStatus,
            qty: itemStatusLogs.qty,
            note: itemStatusLogs.note,
            hasItem: sql<boolean>`${itemStatusLogs.itemId} is not null`,
            hasComp: sql<boolean>`${itemStatusLogs.componentId} is not null`,
          })
          .from(itemStatusLogs)
          .where(eq(itemStatusLogs.eventId, eventId))
        const orderRows = await tx
          .select({
            customer: orders.customerName,
            payment: orders.paymentStatus,
            paid: orders.paidAmount,
          })
          .from(orders)
          .where(eq(orders.eventId, eventId))
        const stockRows = await tx
          .select({ id: partnerVariants.id, stock: partnerVariants.stockQty })
          .from(partnerVariants)
          .where(eq(partnerVariants.partnerProductId, testProductId))
        const noteRows = await tx
          .select({ title: notifications.title, body: notifications.body })
          .from(notifications)
          .where(eq(notifications.eventId, eventId))
        const [sub] = await tx
          .select({ checked: sql<boolean>`${eventSubmissions.stockCheckedAt} is not null` })
          .from(eventSubmissions)
          .where(eq(eventSubmissions.id, submissionId))
        const sorted = (rows: Array<unknown>) => rows.map((r) => JSON.stringify(r)).sort()
        return JSON.stringify({
          items: sorted(itemRows),
          comps: sorted(compRows),
          logs: sorted(logRows),
          orders: sorted(orderRows),
          stock: sorted(stockRows),
          notes: sorted(noteRows),
          checked: sub.checked,
        })
      }
      const cmp = { oldQ: 0, newQ: 0, oldMs: 0, newMs: 0, n: 0 }

      // Per review: 4 query pemeriksaan (status submit, item, log, stok).
      const REVIEW_VERIFY_QUERIES = 4
      console.log(
        `Mengukur reviewSubmission: ${submissions.length} submit x ${rowsPerEvent} baris, concurrency ${reviewConcurrency}, pool ${pool.options.max}...`,
      )
      queryCount = 0
      const durations: Array<number> = []
      let failed = 0
      let reviewed = 0
      const wallStart = performance.now()

      // Path lewat variabel supaya tsc tidak gagal saat salinan sementara tidak ada.
      const oldPath = '../src/lib/__old-submit-queries'
      const oldModule = compare
        ? ((await import(oldPath)) as { reviewSubmission: typeof reviewSubmission })
        : null

      await runPool(submissions, reviewConcurrency, async ({ id: submissionId, eventId }) => {
        const pending = pendingBySubmission.get(submissionId) ?? []
        const decisions = pending.map((row, i) => ({ id: row.id, approvedQty: decide(i, row.qty) }))

        if (oldModule) {
          const compDecisions = (compsBySubmission.get(submissionId) ?? []).map((c, i) => ({
            id: c.id,
            approvedQty: decide(i, c.qty),
          }))
          const input = { submissionId, itemDecisions: decisions, componentDecisions: compDecisions }
          const snaps: Array<string> = []
          for (const [which, fn] of [
            ['old', oldModule.reviewSubmission],
            ['new', reviewSubmission],
          ] as const) {
            try {
              await db.transaction(async (tx) => {
                const q0 = queryCount
                const t0 = performance.now()
                await fn(tx as never, input)
                const ms = performance.now() - t0
                const q = queryCount - q0
                if (which === 'old') {
                  cmp.oldQ += q
                  cmp.oldMs += ms
                } else {
                  cmp.newQ += q
                  cmp.newMs += ms
                }
                snaps.push(await snapshot(tx, submissionId, eventId))
                throw new RollbackSignal()
              })
            } catch (err) {
              if (!(err instanceof RollbackSignal)) {
                failed++
                console.error(`Gagal (${which}) submit ${submissionId}:`, err instanceof Error ? err.message : err)
              }
            }
          }
          if (snaps.length === 2 && snaps[0] !== snaps[1]) {
            const a = JSON.parse(snaps[0]) as Record<string, unknown>
            const b = JSON.parse(snaps[1]) as Record<string, unknown>
            const diffKeys = Object.keys(a).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
            mismatches.push(`submit ${submissionId}: hasil lama dan baru berbeda di ${diffKeys.join(', ')}`)
          }
          cmp.n++
          reviewed++
          return
        }

        const expApproved = decisions.reduce((s, d) => s + d.approvedQty, 0)
        const expTotal = pending.reduce((s, r) => s + r.qty, 0)
        const expRejected = expTotal - expApproved
        const expApprovedRows = decisions.filter((d) => d.approvedQty > 0).length
        const expRejectedRows = pending.filter((r, i) => decisions[i].approvedQty < r.qty).length

        const t0 = performance.now()
        try {
          await db.transaction(async (tx) => {
            await reviewSubmission(tx as never, {
              submissionId,
              itemDecisions: decisions,
              componentDecisions: [],
            })
            const [sub] = await tx
              .select({ checked: sql<boolean>`${eventSubmissions.stockCheckedAt} is not null` })
              .from(eventSubmissions)
              .where(eq(eventSubmissions.id, submissionId))
            const [it] = await tx
              .select({
                pending: sql<number>`count(*) filter (where ${items.submitStatus} = 'pengajuan')::int`,
                apprRows: sql<number>`count(*) filter (where ${items.submitStatus} = 'disetujui')::int`,
                apprQty: sql<number>`coalesce(sum(${items.qty}) filter (where ${items.submitStatus} = 'disetujui'), 0)::int`,
                rejRows: sql<number>`count(*) filter (where ${items.submitStatus} = 'disanggah')::int`,
                rejQty: sql<number>`coalesce(sum(${items.qty}) filter (where ${items.submitStatus} = 'disanggah'), 0)::int`,
              })
              .from(items)
              .where(eq(items.submissionId, submissionId))
            const [lg] = await tx
              .select({
                apprRows: sql<number>`count(*) filter (where ${itemStatusLogs.toStatus} = 'disetujui')::int`,
                apprQty: sql<number>`coalesce(sum(${itemStatusLogs.qty}) filter (where ${itemStatusLogs.toStatus} = 'disetujui'), 0)::int`,
                rejRows: sql<number>`count(*) filter (where ${itemStatusLogs.toStatus} = 'disanggah')::int`,
                rejQty: sql<number>`coalesce(sum(${itemStatusLogs.qty}) filter (where ${itemStatusLogs.toStatus} = 'disanggah'), 0)::int`,
              })
              .from(itemStatusLogs)
              .where(
                and(
                  eq(itemStatusLogs.submissionId, submissionId),
                  eq(itemStatusLogs.fromStatus, 'pengajuan'),
                ),
              )
            // Stok terlihat dari transaksi ini = stok awal dikurangi yang disetujui
            // (transaksi lain yang bersamaan tertahan kunci dan di-rollback).
            const [stock] = await tx
              .select({ total: sql<number>`coalesce(sum(${partnerVariants.stockQty}), 0)::int` })
              .from(partnerVariants)
              .where(eq(partnerVariants.partnerProductId, testProductId))

            const problems: Array<string> = []
            if (!sub.checked) problems.push('stockCheckedAt belum terisi')
            if (it.pending !== 0) problems.push(`masih pengajuan ${it.pending}`)
            if (it.apprQty !== expApproved) problems.push(`qty disetujui ${it.apprQty} (harus ${expApproved})`)
            if (it.rejQty !== expRejected) problems.push(`qty disanggah ${it.rejQty} (harus ${expRejected})`)
            if (it.apprRows !== expApprovedRows) problems.push(`baris disetujui ${it.apprRows} (harus ${expApprovedRows})`)
            if (it.rejRows !== expRejectedRows) problems.push(`baris disanggah ${it.rejRows} (harus ${expRejectedRows})`)
            if (lg.apprQty !== expApproved || lg.apprRows !== expApprovedRows)
              problems.push(`log disetujui ${lg.apprRows} baris/${lg.apprQty} qty`)
            if (lg.rejQty !== expRejected || lg.rejRows !== expRejectedRows)
              problems.push(`log disanggah ${lg.rejRows} baris/${lg.rejQty} qty`)
            const expStock = VARIANT_STOCK * variantIds.length - expApproved
            if (stock.total !== expStock) problems.push(`stok ${stock.total} (harus ${expStock})`)
            if (problems.length > 0) mismatches.push(`submit ${submissionId}: ${problems.join('; ')}`)
            throw new RollbackSignal()
          })
        } catch (err) {
          if (!(err instanceof RollbackSignal)) {
            failed++
            console.error(`Gagal submit ${submissionId}:`, err instanceof Error ? err.message : err)
          }
        }
        durations.push(performance.now() - t0)
        reviewed++
      })

      if (compare) {
        console.log('--- Hasil perbandingan reviewSubmission (lama vs sekarang) ---')
        console.log(`Submit dibandingkan: ${cmp.n}, gagal: ${failed}`)
        console.log(
          `Lama:     ${(cmp.oldQ / cmp.n).toFixed(1)} query per submit, ${(cmp.oldMs / cmp.n).toFixed(0)} ms per submit`,
        )
        console.log(
          `Sekarang: ${(cmp.newQ / cmp.n).toFixed(1)} query per submit, ${(cmp.newMs / cmp.n).toFixed(0)} ms per submit`,
        )
        if (mismatches.length === 0 && failed === 0) {
          console.log(`Hasil akhir IDENTIK untuk ${cmp.n} dari ${cmp.n} submit`)
        } else {
          console.log(`Hasil akhir BERBEDA/GAGAL: ${mismatches.length} submit`)
          for (const m of mismatches.slice(0, 5)) console.log(`  - ${m}`)
          process.exitCode = 1
        }
        return
      }

      const wall = performance.now() - wallStart
      const totalQueries = queryCount - REVIEW_VERIFY_QUERIES * reviewed
      durations.sort((a, b) => a - b)
      const totalRows = rowsPerEvent * submissions.length
      console.log('--- Hasil (reviewSubmission) ---')
      console.log(`Berhasil: ${submissions.length - failed}, gagal: ${failed}`)
      console.log(`Waktu total: ${(wall / 1000).toFixed(2)} dtk`)
      console.log(
        `Per review: p50 ${pct(durations, 50).toFixed(0)} ms, p95 ${pct(durations, 95).toFixed(0)} ms, maks ${pct(durations, 100).toFixed(0)} ms`,
      )
      console.log(
        `Perintah ke database: ${totalQueries} total, rata-rata ${(totalQueries / submissions.length).toFixed(1)} per submit, ${(totalQueries / totalRows).toFixed(2)} per baris`,
      )
      console.log(
        `Rata-rata per perintah: ${(wall / Math.max(1, totalQueries)).toFixed(1)} ms (waktu total / jumlah perintah, concurrency ${reviewConcurrency})`,
      )
      if (mismatches.length === 0 && failed === 0) {
        console.log(`Pemeriksaan hasil: OK untuk ${submissions.length} dari ${submissions.length} submit`)
      } else {
        console.log(`Pemeriksaan hasil: ${mismatches.length} submit TIDAK SESUAI`)
        for (const m of mismatches.slice(0, 5)) console.log(`  - ${m}`)
        process.exitCode = 1
      }
      return
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

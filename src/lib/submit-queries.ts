// Query alur submit bertahap (server-only, menerima `tx` dari pemanggil).
// Aturan pure ada di `submit-status.ts`.
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import {
  eventSubmissions,
  events,
  itemComponents,
  items,
  itemStatusLogs,
  notifications,
  orders,
} from '../db/schema'
import {
  bundleRowStatusAfterReview,
  nextSubmitNo,
  splitReview,
  type SubmitStatus,
} from './submit-status'
import type { OrderTx } from './order-status-queries'
import { recalculateOrderStatus } from './order-status-queries'
import { partnerItemName, variantLabel } from './partner-item-label'
import { aggregateStockDemand, deductVariantStock } from './partner-stock'
import {
  loadVariantInfo,
  regroupAllRulesInOrder,
} from './partner-paket-queries'

/** Fee per pcs paket, sama dengan perhitungan saat paket dibongkar. */
function feePerPcsOf(bundle: {
  fee: string
  ruleMinQty: number | null
  components: Array<{ qty: number }>
}): number {
  const pcs =
    bundle.ruleMinQty ?? bundle.components.reduce((sum, c) => sum + c.qty, 0)
  return pcs > 0 ? Math.round((Number(bundle.fee) / pcs) * 100) / 100 : 0
}

async function logStatus(
  tx: OrderTx,
  entry: {
    eventId: string
    itemId?: string | null
    componentId?: string | null
    submissionId: string | null
    from: SubmitStatus | null
    to: SubmitStatus | null
    qty: number
    note?: string
  },
) {
  await tx.insert(itemStatusLogs).values({
    eventId: entry.eventId,
    itemId: entry.itemId ?? null,
    componentId: entry.componentId ?? null,
    submissionId: entry.submissionId,
    fromStatus: entry.from,
    toStatus: entry.to,
    qty: entry.qty,
    note: entry.note ?? null,
  })
}

/**
 * Jastiper menekan Submit. Semua baris draft (belum disubmit) di event ini
 * menjadi pengajuan dengan nomor submit berikutnya, lalu terkunci qty-nya.
 */
export async function submitEventOrders(
  tx: OrderTx,
  eventId: string,
  now: Date,
): Promise<{ submitNo: number; submissionId: string }> {
  const draftItems = await tx
    .select({ id: items.id, qty: items.qty })
    .from(items)
    .innerJoin(orders, eq(orders.id, items.orderId))
    .where(
      and(
        eq(orders.eventId, eventId),
        eq(items.isBundle, false),
        isNull(items.submitStatus),
      ),
    )
  const draftComps = await tx
    .select({ id: itemComponents.id, qty: itemComponents.qty })
    .from(itemComponents)
    .innerJoin(items, eq(items.id, itemComponents.itemId))
    .innerJoin(orders, eq(orders.id, items.orderId))
    .where(and(eq(orders.eventId, eventId), isNull(itemComponents.submitStatus)))

  const sendable = draftItems.filter((r) => r.qty > 0)
  if (sendable.length === 0 && draftComps.length === 0) {
    throw new Error('Belum ada barang untuk dikirim ke partner.')
  }

  const existing = await tx
    .select({ submitNo: eventSubmissions.submitNo })
    .from(eventSubmissions)
    .where(eq(eventSubmissions.eventId, eventId))
  const submitNo = nextSubmitNo(existing.map((r) => r.submitNo))
  const [submission] = await tx
    .insert(eventSubmissions)
    .values({ eventId, submitNo, submittedAt: now })
    .returning({ id: eventSubmissions.id })

  for (const row of sendable) {
    await tx
      .update(items)
      .set({ submitStatus: 'pengajuan', submissionId: submission.id })
      .where(eq(items.id, row.id))
    await logStatus(tx, {
      eventId,
      itemId: row.id,
      submissionId: submission.id,
      from: null,
      to: 'pengajuan',
      qty: row.qty,
    })
  }
  for (const row of draftComps) {
    await tx
      .update(itemComponents)
      .set({ submitStatus: 'pengajuan', submissionId: submission.id })
      .where(eq(itemComponents.id, row.id))
    await logStatus(tx, {
      eventId,
      componentId: row.id,
      submissionId: submission.id,
      from: null,
      to: 'pengajuan',
      qty: row.qty,
    })
  }

  // Penanda lama tetap terisi supaya daftar event partner tetap bisa
  // mengurutkan antrean. Kunci per baris yang dipakai alur baru.
  await tx
    .update(events)
    .set({ submittedAt: now })
    .where(and(eq(events.id, eventId), isNull(events.submittedAt)))

  return { submitNo, submissionId: submission.id }
}

export type ReviewDecision = { id: string; approvedQty: number }

/**
 * Partner mengecek satu submit. Setiap baris pengajuan diberi jumlah yang
 * disetujui, lalu dipecah:
 * - bagian disetujui: baris satuan berstatus disetujui (untuk paket, komponen
 *   yang disetujui kembali ke satuan)
 * - bagian disanggah: tetap tampil sebagai riwayat, tidak masuk total/tagihan
 */
export async function reviewSubmission(
  tx: OrderTx,
  input: {
    submissionId: string
    itemDecisions: Array<ReviewDecision>
    componentDecisions: Array<ReviewDecision>
  },
): Promise<{ affectedOrderIds: Array<string> }> {
  const { submissionId, itemDecisions, componentDecisions } = input
  const submission = await tx.query.eventSubmissions.findFirst({
    where: eq(eventSubmissions.id, submissionId),
  })
  if (!submission) throw new Error('Submit tidak ditemukan.')
  const eventId = submission.eventId

  const pendingItems = await tx
    .select()
    .from(items)
    .where(
      and(
        eq(items.submissionId, submissionId),
        eq(items.submitStatus, 'pengajuan'),
      ),
    )
  const pendingComps = await tx
    .select()
    .from(itemComponents)
    .where(
      and(
        eq(itemComponents.submissionId, submissionId),
        eq(itemComponents.submitStatus, 'pengajuan'),
      ),
    )

  const itemMap = new Map(itemDecisions.map((d) => [d.id, d.approvedQty]))
  const compMap = new Map(componentDecisions.map((d) => [d.id, d.approvedQty]))
  for (const row of pendingItems) {
    if (!itemMap.has(row.id)) throw new Error('Ada barang yang belum dicek.')
  }
  for (const row of pendingComps) {
    if (!compMap.has(row.id)) throw new Error('Ada barang yang belum dicek.')
  }

  // Stok varian berkurang sebesar jumlah yang disetujui, dalam transaksi yang
  // sama dengan perubahan status. Kalau ada varian yang kurang, seluruh cek
  // dibatalkan dan partner diminta mengurangi isian "Dapat".
  const approvedDemand = aggregateStockDemand([
    ...pendingItems.map((row) => ({
      variantId: row.partnerVariantId,
      qty: splitReview(row.qty, itemMap.get(row.id)!).approved,
    })),
    ...pendingComps.map((c) => ({
      variantId: c.partnerVariantId,
      qty: splitReview(c.qty, compMap.get(c.id)!).approved,
    })),
  ])
  const stockInfo = await loadVariantInfo(tx, [...approvedDemand.keys()])
  await deductVariantStock(tx, approvedDemand, (variantId) => {
    const info = stockInfo.get(variantId)
    return info
      ? partnerItemName(
          info.productName,
          variantLabel({ size: info.size, variation: info.variation }),
        )
      : 'Barang'
  })

  const affectedOrders = new Set<string>()

  // Baris satuan.
  for (const row of pendingItems) {
    const split = splitReview(row.qty, itemMap.get(row.id)!)
    affectedOrders.add(row.orderId)
    if (split.approved > 0 && split.rejected > 0) {
      await tx
        .update(items)
        .set({ qty: split.approved, submitStatus: 'disetujui' })
        .where(eq(items.id, row.id))
      const { id: _id, ...copy } = row
      const [rejectedRow] = await tx
        .insert(items)
        .values({
          ...copy,
          qty: split.rejected,
          submitStatus: 'disanggah',
        })
        .returning({ id: items.id })
      await logStatus(tx, {
        eventId,
        itemId: rejectedRow.id,
        submissionId,
        from: 'pengajuan',
        to: 'disanggah',
        qty: split.rejected,
        note: 'tidak tersedia dari partner',
      })
      await logStatus(tx, {
        eventId,
        itemId: row.id,
        submissionId,
        from: 'pengajuan',
        to: 'disetujui',
        qty: split.approved,
      })
    } else if (split.approved > 0) {
      await tx
        .update(items)
        .set({ submitStatus: 'disetujui' })
        .where(eq(items.id, row.id))
      await logStatus(tx, {
        eventId,
        itemId: row.id,
        submissionId,
        from: 'pengajuan',
        to: 'disetujui',
        qty: row.qty,
      })
    } else {
      await tx
        .update(items)
        .set({ submitStatus: 'disanggah' })
        .where(eq(items.id, row.id))
      await logStatus(tx, {
        eventId,
        itemId: row.id,
        submissionId,
        from: 'pengajuan',
        to: 'disanggah',
        qty: row.qty,
        note: 'tidak tersedia dari partner',
      })
    }
  }

  // Komponen paket: bagian disetujui kembali ke satuan, sisanya tinggal di
  // paket sebagai riwayat disanggah.
  const compsByBundle = new Map<string, Array<(typeof pendingComps)[number]>>()
  for (const c of pendingComps) {
    const list = compsByBundle.get(c.itemId) ?? []
    list.push(c)
    compsByBundle.set(c.itemId, list)
  }
  const bundleIds = [...compsByBundle.keys()]
  const bundles = bundleIds.length
    ? await tx.query.items.findMany({
        where: inArray(items.id, bundleIds),
        with: { components: true },
      })
    : []
  const infoMap = await loadVariantInfo(
    tx,
    pendingComps
      .map((c) => c.partnerVariantId)
      .filter((id): id is string => id !== null),
  )

  for (const bundle of bundles) {
    affectedOrders.add(bundle.orderId)
    const feePerPcs = feePerPcsOf(bundle)
    for (const c of compsByBundle.get(bundle.id)!) {
      const split = splitReview(c.qty, compMap.get(c.id)!)
      const info = c.partnerVariantId
        ? infoMap.get(c.partnerVariantId)
        : undefined
      const price = info ? info.price : 0

      if (split.approved > 0) {
        await tx.insert(items).values({
          orderId: bundle.orderId,
          name: partnerItemName(
            c.productName,
            variantLabel({ size: c.size, variation: c.variation }),
          ),
          originalPrice: price.toString(),
          fee: feePerPcs.toFixed(2),
          qty: split.approved,
          obtained: false,
          isBundle: false,
          partnerVariantId: c.partnerVariantId,
          hpp: price.toString(),
          submitStatus: 'disetujui',
          submissionId,
          createdAt: c.addedAt,
        })
        await logStatus(tx, {
          eventId,
          componentId: c.id,
          submissionId,
          from: 'pengajuan',
          to: 'disetujui',
          qty: split.approved,
          note: 'kembali ke barang satuan',
        })
      }

      if (split.rejected > 0) {
        await tx
          .update(itemComponents)
          .set({ qty: split.rejected, submitStatus: 'disanggah' })
          .where(eq(itemComponents.id, c.id))
        await logStatus(tx, {
          eventId,
          componentId: c.id,
          submissionId,
          from: 'pengajuan',
          to: 'disanggah',
          qty: split.rejected,
          note: 'tidak tersedia dari partner',
        })
      } else {
        await logStatus(tx, {
          eventId,
          componentId: c.id,
          submissionId,
          from: 'pengajuan',
          to: null,
          qty: 0,
          note: 'seluruh pcs dikembalikan ke satuan',
        })
        await tx.delete(itemComponents).where(eq(itemComponents.id, c.id))
      }
    }

    // Sisa komponen menentukan nama dan keadaan paket.
    const remaining = await tx
      .select()
      .from(itemComponents)
      .where(eq(itemComponents.itemId, bundle.id))
      .orderBy(asc(itemComponents.addedAt), asc(itemComponents.id))
    if (remaining.length === 0) {
      await tx.delete(items).where(eq(items.id, bundle.id))
      continue
    }
    const name = remaining
      .map((c) =>
        partnerItemName(
          c.productName,
          variantLabel({ size: c.size, variation: c.variation }),
        ),
      )
      .join(' + ')
    await tx.update(items).set({ name }).where(eq(items.id, bundle.id))
    // Paket yang masih punya komponen disanggah tidak ditagih sebagai paket.
    // Pcs yang disetujui sudah pindah ke barang satuan dan ditagih di sana.
    const bundleStatus = bundleRowStatusAfterReview(remaining)
    if (bundleStatus) {
      await tx
        .update(items)
        .set({ submitStatus: bundleStatus, submissionId })
        .where(eq(items.id, bundle.id))
    }
  }

  // Paket baru bisa terbentuk dari pcs yang baru kembali ke satuan.
  for (const orderId of affectedOrders) {
    await regroupAllRulesInOrder(tx, orderId)
    await recalculateOrderStatus(tx, orderId)
  }
  // Kabari jastiper: hasil cek partner untuk submit ini (disetujui semua, atau ada yang disanggah).
  const anyRejected =
    pendingItems.some((r) => (itemMap.get(r.id) ?? 0) < r.qty) ||
    pendingComps.some((c) => (compMap.get(c.id) ?? 0) < c.qty)
  const eventRow = await tx
    .select({
      brandId: events.brandId,
      calendarEventId: events.calendarEventId,
    })
    .from(events)
    .where(eq(events.id, eventId))
    .then((rows) => rows.at(0))
  if (eventRow) {
    await tx.insert(notifications).values({
      brandId: eventRow.brandId,
      kind: 'status_pesanan',
      title: anyRejected
        ? `Submit ke-${submission.submitNo}: ada barang yang ditolak`
        : `Submit ke-${submission.submitNo}: semua barang disetujui`,
      body: anyRejected
        ? 'Barang yang ditolak tidak masuk total. Kirim pengganti lewat Submit ulang.'
        : 'Semua barang di pengajuan ini disetujui partner.',
      target: 'event',
      eventId,
      calendarEventId: eventRow.calendarEventId,
    })
  }

  return { affectedOrderIds: [...affectedOrders] }
}

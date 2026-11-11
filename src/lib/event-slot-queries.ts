// Query alur slot event partner (server-only, menerima `tx` dari pemanggil).
// Aturan alur dan penamaan status ada di `event-slot.ts`.
import { and, asc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import {
  brands,
  calendarEvents,
  events,
  itemComponents,
  items,
  orders,
  partnerRuleProducts,
  partnerRuleSizes,
  partnerVariants,
} from '../db/schema'
import {
  allocateApproval,
  applySatuanApproval,
  bundleReviewState,
  deriveSlotStatus,
  isSanggahExpired,
  planReplacement,
  validateSanggahDeadline,
} from './event-slot'
import type { BundleReviewState, SlotConfig, SlotStatus } from './event-slot'
import type { OrderTx } from './order-status-queries'
import { recalculateOrderStatus } from './order-status-queries'
import { partnerItemName, variantLabel } from './partner-item-label'
import {
  dissolveBundle,
  isProductInEvent,
  loadVariantInfo,
  regroupAllRulesInOrder,
  regroupRuleInOrder,
} from './partner-paket-queries'

export async function loadSlotConfig(
  tx: OrderTx,
  calendarEventId: string | null,
): Promise<SlotConfig | null> {
  if (!calendarEventId) return null
  const rows = await tx
    .select({
      partnerId: calendarEvents.partnerId,
      opensAt: calendarEvents.slotOpensAt,
      closesAt: calendarEvents.slotClosesAt,
    })
    .from(calendarEvents)
    .where(eq(calendarEvents.id, calendarEventId))
  return rows.at(0) ?? null
}

/**
 * Urutan submit satu jastiper di satu event kalender: "Urutan #rank dari
 * total". Dihitung di database (bukan di JS) supaya presisi mikrodetik dari
 * `now()` ikut menentukan urutan; `id` hanya pemecah kalau waktunya persis sama.
 */
export async function getSubmitPosition(
  tx: OrderTx,
  calendarEventId: string,
  eventId: string,
): Promise<{ rank: number; total: number } | null> {
  const result = await tx.execute(sql`
    select rank, total from (
      select id,
             row_number() over (order by submitted_at, id) as rank,
             count(*) over () as total
      from events
      where calendar_event_id = ${calendarEventId} and submitted_at is not null
    ) q
    where id = ${eventId}
  `)
  const row = result.rows.at(0) as
    { rank: string | number; total: string | number } | undefined
  if (!row) return null
  return { rank: Number(row.rank), total: Number(row.total) }
}

/** Jumlah baris barang yang dapat dikirim (qty > 0) di semua pesanan event ini. */
export async function countSubmittableItems(
  tx: OrderTx,
  eventId: string,
): Promise<number> {
  const rows = await tx
    .select({ id: items.id })
    .from(items)
    .innerJoin(orders, eq(orders.id, items.orderId))
    .where(and(eq(orders.eventId, eventId), sql`${items.qty} > 0`))
  return rows.length
}

/** Status review tiap paket (`ok`/`sanggah`/`verifikasi`) per event. */
export async function loadBundleStatesByEvent(
  tx: OrderTx,
  eventIds: Array<string>,
): Promise<Map<string, Map<string, BundleReviewState>>> {
  const result = new Map<string, Map<string, BundleReviewState>>()
  if (eventIds.length === 0) return result
  const rows = await tx
    .select({
      eventId: orders.eventId,
      bundleId: items.id,
      qty: itemComponents.qty,
      approvedQty: itemComponents.approvedQty,
    })
    .from(items)
    .innerJoin(orders, eq(orders.id, items.orderId))
    .innerJoin(itemComponents, eq(itemComponents.itemId, items.id))
    .where(and(inArray(orders.eventId, eventIds), eq(items.isBundle, true)))

  const grouped = new Map<
    string,
    Map<string, Array<{ qty: number; approvedQty: number | null }>>
  >()
  for (const row of rows) {
    const byBundle = grouped.get(row.eventId) ?? new Map()
    const comps = byBundle.get(row.bundleId) ?? []
    comps.push({ qty: row.qty, approvedQty: row.approvedQty })
    byBundle.set(row.bundleId, comps)
    grouped.set(row.eventId, byBundle)
  }
  for (const [eventId, byBundle] of grouped) {
    const states = new Map<string, BundleReviewState>()
    for (const [bundleId, comps] of byBundle) {
      states.set(bundleId, bundleReviewState(comps))
    }
    result.set(eventId, states)
  }
  return result
}

export type SlotSummary = {
  status: SlotStatus
  opensAt: Date
  closesAt: Date
  submittedAt: Date | null
  reviewedAt: Date | null
  sanggahDeadline: Date | null
  /** Urutan submit; null sebelum submit. */
  rank: number | null
  total: number | null
  /** Status review per id paket; hanya terisi setelah partner selesai mengecek. */
  bundleStates: Record<string, BundleReviewState>
}

type SlotEventRow = Pick<
  typeof events.$inferSelect,
  | 'id'
  | 'calendarEventId'
  | 'submittedAt'
  | 'reviewedAt'
  | 'sanggahDeadline'
  | 'decidedAt'
>

/** Ringkasan alur slot satu event jastiper. Null = event tidak memakai alur slot. */
export async function getSlotSummary(
  tx: OrderTx,
  event: SlotEventRow,
  now: Date,
): Promise<SlotSummary | null> {
  const config = await loadSlotConfig(tx, event.calendarEventId)
  if (!config || !event.calendarEventId) return null
  const statesByEvent = await loadBundleStatesByEvent(tx, [event.id])
  const states = statesByEvent.get(event.id) ?? new Map()
  const reviewed = event.reviewedAt !== null
  const status = deriveSlotStatus({
    config,
    submittedAt: event.submittedAt,
    reviewedAt: event.reviewedAt,
    decidedAt: event.decidedAt,
    bundleStates: reviewed ? [...states.values()] : [],
    now,
  })
  if (status === null) return null
  const position =
    event.submittedAt !== null
      ? await getSubmitPosition(tx, event.calendarEventId, event.id)
      : null
  return {
    status,
    opensAt: config.opensAt as Date,
    closesAt: config.closesAt as Date,
    submittedAt: event.submittedAt,
    reviewedAt: event.reviewedAt,
    sanggahDeadline: event.sanggahDeadline,
    rank: position?.rank ?? null,
    total: position?.total ?? null,
    bundleStates: reviewed ? Object.fromEntries(states) : {},
  }
}

// ---------------------------------------------------------------------------
// Sanggah: keputusan jastiper

/**
 * "Tidak ganti": paket dibongkar, hanya pcs yang dapat kembali menjadi satuan
 * (yang tidak dapat tampil sebagai baris qty 0), lalu FIFO jalan lagi dari pcs
 * yang sudah disetujui. Pcs yang disetujui partner boleh membentuk paket baru
 * tanpa dicek ulang.
 */
export async function keepBundleWithoutReplacement(
  tx: OrderTx,
  bundleId: string,
): Promise<{ orderId: string }> {
  const bundle = await tx.query.items.findFirst({
    where: eq(items.id, bundleId),
    with: { components: true },
  })
  if (!bundle?.isBundle) throw new Error('Barang ini bukan paket')
  const state = bundleReviewState(bundle.components)
  if (state === 'ok') throw new Error('Paket ini tidak bermasalah.')
  if (bundle.components.some((c) => c.approvedQty === null)) {
    throw new Error('Tunggu partner memverifikasi barang pengganti dulu.')
  }
  await dissolveBundle(tx, bundle.id, { useApproved: true })
  if (bundle.partnerRuleId) {
    await regroupRuleInOrder(tx, bundle.orderId, bundle.partnerRuleId)
  }
  await recalculateOrderStatus(tx, bundle.orderId)
  return { orderId: bundle.orderId }
}

/** Pastikan varian boleh dipakai sebagai pengganti di paket dengan aturan ini. */
async function assertReplacementVariant(
  tx: OrderTx,
  input: {
    ruleId: string
    variantId: string
    calendarEventId: string
  },
) {
  const info = (await loadVariantInfo(tx, [input.variantId])).get(
    input.variantId,
  )
  const variant = await tx
    .select({ isActive: partnerVariants.isActive })
    .from(partnerVariants)
    .where(eq(partnerVariants.id, input.variantId))
    .then((rows) => rows.at(0))
  if (!info || !variant?.isActive) {
    throw new Error('Varian tidak ditemukan atau nonaktif.')
  }
  const ruleProducts = await tx
    .select({ productId: partnerRuleProducts.partnerProductId })
    .from(partnerRuleProducts)
    .where(eq(partnerRuleProducts.ruleId, input.ruleId))
  if (!ruleProducts.some((r) => r.productId === info.productId)) {
    throw new Error('Produk ini tidak masuk aturan paket.')
  }
  const sizeRows = await tx
    .select({ name: partnerRuleSizes.sizeName })
    .from(partnerRuleSizes)
    .where(eq(partnerRuleSizes.ruleId, input.ruleId))
  if (
    sizeRows.length > 0 &&
    (info.size === null || !sizeRows.some((z) => z.name === info.size))
  ) {
    throw new Error('Ukuran ini tidak masuk rentang aturan paket.')
  }
  if (!(await isProductInEvent(tx, input.calendarEventId, info.productId))) {
    throw new Error(`${info.productName} tidak dijual di event ini.`)
  }
  return info
}

/**
 * "Ganti": komponen yang bermasalah diganti varian lain dari aturan paket yang
 * sama. Barang pengganti menunggu verifikasi partner (`approved_qty` null).
 */
export async function replaceBundleComponent(
  tx: OrderTx,
  input: { componentId: string; variantId: string; calendarEventId: string },
): Promise<{ orderId: string }> {
  const component = await tx.query.itemComponents.findFirst({
    where: eq(itemComponents.id, input.componentId),
  })
  if (!component) throw new Error('Barang tidak ditemukan')
  const bundle = await tx.query.items.findFirst({
    where: eq(items.id, component.itemId),
  })
  if (!bundle?.isBundle) throw new Error('Barang ini bukan paket')
  if (!bundle.partnerRuleId) {
    throw new Error(
      'Aturan paket ini sudah tidak aktif, jadi isinya tidak bisa diganti.',
    )
  }

  const plan = planReplacement(
    { qty: component.qty, approvedQty: component.approvedQty },
    component.partnerVariantId === input.variantId,
  )
  const info = await assertReplacementVariant(tx, {
    ruleId: bundle.partnerRuleId,
    variantId: input.variantId,
    calendarEventId: input.calendarEventId,
  })
  const snapshot = {
    partnerVariantId: input.variantId,
    productName: info.productName,
    size: info.size,
    variation: info.variation,
  }

  if (plan.kind === 'swap') {
    await tx
      .update(itemComponents)
      .set({ ...snapshot, approvedQty: null })
      .where(eq(itemComponents.id, component.id))
  } else {
    await tx
      .update(itemComponents)
      .set({ qty: plan.keepQty })
      .where(eq(itemComponents.id, component.id))
    await tx.insert(itemComponents).values({
      itemId: bundle.id,
      ...snapshot,
      qty: plan.newQty,
      approvedQty: null,
      addedAt: component.addedAt,
    })
  }

  const comps = await tx
    .select()
    .from(itemComponents)
    .where(eq(itemComponents.itemId, bundle.id))
    .orderBy(asc(itemComponents.addedAt), asc(itemComponents.id))
  const name = comps
    .map((c) =>
      partnerItemName(
        c.productName,
        variantLabel({ size: c.size, variation: c.variation }),
      ),
    )
    .join(' + ')
  await tx.update(items).set({ name }).where(eq(items.id, bundle.id))
  return { orderId: bundle.orderId }
}

/**
 * Batas sanggah lewat: paket yang masih bermasalah otomatis "tidak ganti".
 * Paket yang masih punya barang pengganti menunggu verifikasi dilewati karena
 * itu giliran partner. Dipanggil saat halaman dibuka dan oleh job terjadwal.
 */
export async function resolveExpiredSanggah(
  tx: OrderTx,
  eventId: string,
  now: Date,
): Promise<number> {
  const event = await tx.query.events.findFirst({
    where: eq(events.id, eventId),
  })
  if (!event?.reviewedAt || !isSanggahExpired(event.sanggahDeadline, now))
    return 0

  const bundles = await tx
    .select({ id: items.id })
    .from(items)
    .innerJoin(orders, eq(orders.id, items.orderId))
    .where(and(eq(orders.eventId, eventId), eq(items.isBundle, true)))
  let resolved = 0
  for (const { id } of bundles) {
    const comps = await tx
      .select({
        qty: itemComponents.qty,
        approvedQty: itemComponents.approvedQty,
      })
      .from(itemComponents)
      .where(eq(itemComponents.itemId, id))
    if (bundleReviewState(comps) !== 'sanggah') continue
    if (comps.some((c) => c.approvedQty === null)) continue
    await keepBundleWithoutReplacement(tx, id)
    resolved += 1
  }
  if (resolved > 0) {
    await tx
      .update(events)
      .set({ decidedAt: now })
      .where(eq(events.id, eventId))
  }
  return resolved
}

/** Event yang batas sanggahnya lewat dan masih punya paket bermasalah. Untuk job terjadwal. */
export async function listEventsWithExpiredSanggah(
  tx: OrderTx,
  now: Date,
): Promise<Array<string>> {
  const rows = await tx
    .select({ id: events.id })
    .from(events)
    .where(
      and(
        isNotNull(events.reviewedAt),
        isNotNull(events.sanggahDeadline),
        sql`${events.sanggahDeadline} <= ${now}`,
      ),
    )
  return rows.map((r) => r.id)
}

// ---------------------------------------------------------------------------
// Pengecekan partner (per varian, tanpa nama pemesan)

export type ReviewGroup = {
  variantId: string
  productName: string
  size: string | null
  variation: string | null
  /** Pcs yang diminta (satuan + isi paket), tidak termasuk pengganti yang menunggu verifikasi. */
  requestedPcs: number
  satuanPcs: number
  paketPcs: number
  /** Pcs yang sudah disetujui; null sebelum pengecekan pertama. */
  approvedPcs: number | null
  /** Pcs barang pengganti yang menunggu verifikasi. */
  pendingPcs: number
}

type DemandRow = {
  key: string
  qty: number
  at: Date
  variantId: string
  kind: 'satuan' | 'komponen'
  pending: boolean
}

async function loadEventDemand(
  tx: OrderTx,
  eventId: string,
  reviewed: boolean,
): Promise<Array<DemandRow & { requested: number; approved: number | null }>> {
  const satuan = await tx
    .select({
      id: items.id,
      qty: items.qty,
      requestedQty: items.requestedQty,
      createdAt: items.createdAt,
      variantId: items.partnerVariantId,
    })
    .from(items)
    .innerJoin(orders, eq(orders.id, items.orderId))
    .where(
      and(
        eq(orders.eventId, eventId),
        eq(items.isBundle, false),
        isNotNull(items.partnerVariantId),
      ),
    )
  const comps = await tx
    .select({
      id: itemComponents.id,
      qty: itemComponents.qty,
      approvedQty: itemComponents.approvedQty,
      addedAt: itemComponents.addedAt,
      variantId: itemComponents.partnerVariantId,
    })
    .from(itemComponents)
    .innerJoin(items, eq(items.id, itemComponents.itemId))
    .innerJoin(orders, eq(orders.id, items.orderId))
    .where(
      and(
        eq(orders.eventId, eventId),
        eq(items.isBundle, true),
        isNotNull(itemComponents.partnerVariantId),
      ),
    )
  const rows: Array<
    DemandRow & { requested: number; approved: number | null }
  > = []
  for (const s of satuan) {
    const requested = s.requestedQty ?? s.qty
    rows.push({
      key: `i:${s.id}`,
      qty: requested,
      at: s.createdAt,
      variantId: s.variantId as string,
      kind: 'satuan',
      pending: false,
      requested,
      approved: reviewed ? s.qty : null,
    })
  }
  for (const c of comps) {
    rows.push({
      key: `c:${c.id}`,
      qty: c.qty,
      at: c.addedAt,
      variantId: c.variantId as string,
      kind: 'komponen',
      pending: reviewed && c.approvedQty === null,
      requested: c.qty,
      approved: reviewed ? c.approvedQty : null,
    })
  }
  return rows
}

/** Rekap per varian untuk satu jastiper, dipakai halaman pengecekan partner. */
export async function loadReviewGroups(
  tx: OrderTx,
  eventId: string,
): Promise<Array<ReviewGroup>> {
  const event = await tx.query.events.findFirst({
    where: eq(events.id, eventId),
  })
  if (!event) return []
  const reviewed = event.reviewedAt !== null
  const demand = await loadEventDemand(tx, eventId, reviewed)
  const infoMap = await loadVariantInfo(
    tx,
    demand.map((d) => d.variantId),
  )
  const groups = new Map<string, ReviewGroup>()
  for (const d of demand) {
    const info = infoMap.get(d.variantId)
    if (!info) continue
    const group =
      groups.get(d.variantId) ??
      ({
        variantId: d.variantId,
        productName: info.productName,
        size: info.size,
        variation: info.variation,
        requestedPcs: 0,
        satuanPcs: 0,
        paketPcs: 0,
        approvedPcs: reviewed ? 0 : null,
        pendingPcs: 0,
      } satisfies ReviewGroup)
    if (d.pending) {
      group.pendingPcs += d.qty
    } else {
      group.requestedPcs += d.requested
      if (d.kind === 'satuan') group.satuanPcs += d.requested
      else group.paketPcs += d.requested
      if (reviewed)
        group.approvedPcs = (group.approvedPcs ?? 0) + (d.approved ?? 0)
    }
    groups.set(d.variantId, group)
  }
  return [...groups.values()].sort(
    (a, b) =>
      a.productName.localeCompare(b.productName) ||
      (a.size ?? '').localeCompare(b.size ?? '') ||
      (a.variation ?? '').localeCompare(b.variation ?? ''),
  )
}

export type ReviewResult = {
  variantId: string
  /** Total pcs yang dapat untuk varian ini. Kosong = dapat semua (pengecekan pertama). */
  approvedPcs?: number
  /** Dari pcs barang pengganti yang menunggu verifikasi, berapa yang dapat. */
  pendingApprovedPcs?: number
}

async function applyAllocation(
  tx: OrderTx,
  demand: Array<DemandRow & { requested: number; approved: number | null }>,
  approvedTotal: number,
) {
  const allocation = allocateApproval(
    demand.map((d) => ({ key: d.key, qty: d.qty, at: d.at })),
    approvedTotal,
  )
  for (const d of demand) {
    const approved = allocation.get(d.key) ?? 0
    const id = d.key.slice(2)
    if (d.kind === 'satuan') {
      const [row] = await tx.select().from(items).where(eq(items.id, id))
      const next = applySatuanApproval(row, approved)
      await tx
        .update(items)
        .set({ qty: next.qty, requestedQty: next.requestedQty })
        .where(eq(items.id, id))
    } else {
      await tx
        .update(itemComponents)
        .set({ approvedQty: approved })
        .where(eq(itemComponents.id, id))
    }
  }
}

/**
 * Simpan hasil pengecekan partner. Pengecekan pertama menetapkan `reviewed_at`
 * dan batas sanggah; sesudahnya bisa dipakai untuk koreksi hasil dan verifikasi
 * barang pengganti. Pcs disetujui dibagikan ke pemesan yang masuk lebih dulu
 * (waktu masuk paling lama), karena partner tidak melihat nama pemesan.
 */
export async function saveReviewResults(
  tx: OrderTx,
  input: {
    eventId: string
    results: Array<ReviewResult>
    deadline: Date | null
    now: Date
  },
): Promise<{ firstReview: boolean }> {
  const event = await tx.query.events.findFirst({
    where: eq(events.id, input.eventId),
  })
  if (!event) throw new Error('Event tidak ditemukan')
  if (event.submittedAt === null) {
    throw new Error('Jastiper ini belum mengirim pesanan.')
  }
  const firstReview = event.reviewedAt === null

  let deadline = event.sanggahDeadline
  if (input.deadline !== null) {
    const problem = validateSanggahDeadline(
      input.deadline,
      input.now,
      event.sanggahDeadline,
    )
    if (problem) throw new Error(problem)
    deadline = input.deadline
  }
  if (firstReview && deadline === null) {
    throw new Error('Isi batas waktu sanggah sebelum menyelesaikan pengecekan.')
  }

  const demand = await loadEventDemand(tx, input.eventId, !firstReview)
  const byVariant = new Map<string, typeof demand>()
  for (const d of demand) {
    byVariant.set(d.variantId, [...(byVariant.get(d.variantId) ?? []), d])
  }
  const resultByVariant = new Map(input.results.map((r) => [r.variantId, r]))
  for (const r of input.results) {
    if (!byVariant.has(r.variantId)) {
      throw new Error('Barang tidak ditemukan di pesanan jastiper ini.')
    }
  }

  if (firstReview) {
    // Varian yang tidak disebut dianggap dapat semua.
    for (const [variantId, rows] of byVariant) {
      const total = rows.reduce((sum, d) => sum + d.qty, 0)
      const approved = resultByVariant.get(variantId)?.approvedPcs ?? total
      await applyAllocation(tx, rows, approved)
    }
    await tx
      .update(events)
      .set({ reviewedAt: input.now, sanggahDeadline: deadline })
      .where(eq(events.id, input.eventId))
  } else {
    for (const result of input.results) {
      const rows = byVariant.get(result.variantId) ?? []
      if (result.approvedPcs !== undefined) {
        const settled = rows.filter((d) => !d.pending)
        if (settled.length > 0) {
          await applyAllocation(tx, settled, result.approvedPcs)
        }
      }
      if (result.pendingApprovedPcs !== undefined) {
        const pending = rows.filter((d) => d.pending)
        if (pending.length > 0) {
          await applyAllocation(tx, pending, result.pendingApprovedPcs)
        }
      }
    }
    if (input.deadline !== null) {
      await tx
        .update(events)
        .set({ sanggahDeadline: deadline })
        .where(eq(events.id, input.eventId))
    }
  }

  // Pcs yang disetujui bisa membentuk paket baru (FIFO), dan total pesanan berubah.
  const eventOrders = await tx
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.eventId, input.eventId))
  for (const order of eventOrders) {
    await regroupAllRulesInOrder(tx, order.id)
  }
  return { firstReview }
}

// ---------------------------------------------------------------------------
// Antrean partner

export type SlotQueueRow = {
  eventId: string
  brandId: string
  brandName: string | null
  submittedAt: Date | null
  reviewedAt: Date | null
  sanggahDeadline: Date | null
  rank: number | null
  status: SlotStatus | null
  sanggahBundles: number
  verifyBundles: number
}

/** Jastiper di satu event kalender, berurutan sesuai urutan submit (yang belum submit di bawah). */
export async function listSlotQueue(
  tx: OrderTx,
  calendarEventId: string,
  now: Date,
): Promise<Array<SlotQueueRow>> {
  const config = await loadSlotConfig(tx, calendarEventId)
  const rows = await tx
    .select({
      eventId: events.id,
      brandId: events.brandId,
      brandName: brands.name,
      submittedAt: events.submittedAt,
      reviewedAt: events.reviewedAt,
      sanggahDeadline: events.sanggahDeadline,
      decidedAt: events.decidedAt,
    })
    .from(events)
    .innerJoin(brands, eq(brands.id, events.brandId))
    .where(eq(events.calendarEventId, calendarEventId))
    .orderBy(sql`${events.submittedAt} asc nulls last`, asc(events.id))
  const statesByEvent = await loadBundleStatesByEvent(
    tx,
    rows.map((r) => r.eventId),
  )
  let rank = 0
  return rows.map((r) => {
    const states = [...(statesByEvent.get(r.eventId)?.values() ?? [])]
    const reviewed = r.reviewedAt !== null
    return {
      eventId: r.eventId,
      brandId: r.brandId,
      brandName: r.brandName,
      submittedAt: r.submittedAt,
      reviewedAt: r.reviewedAt,
      sanggahDeadline: r.sanggahDeadline,
      rank: r.submittedAt !== null ? ++rank : null,
      status: deriveSlotStatus({
        config,
        submittedAt: r.submittedAt,
        reviewedAt: r.reviewedAt,
        decidedAt: r.decidedAt,
        bundleStates: reviewed ? states : [],
        now,
      }),
      sanggahBundles: reviewed
        ? states.filter((s) => s === 'sanggah').length
        : 0,
      verifyBundles: reviewed
        ? states.filter((s) => s === 'verifikasi').length
        : 0,
    }
  })
}

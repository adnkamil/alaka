// Query alur pengganti barang yang disanggah (server-only, menerima `tx`).
// Aturan murni ada di `submit-replacement.ts`.
//
// Pengganti selalu dikirim sebagai barang satuan berstatus pengajuan di
// pesanan yang sama, dan tinggal di submit yang sama dengan barang yang
// ditolak. Submit itu dibuka lagi (menunggu dicek) dan didahulukan di antrean.
// Setelah disetujui, barang itu ikut FIFO paket customer seperti barang satuan lain.
import { and, eq, inArray, sql } from 'drizzle-orm'
import {
  eventSubmissions,
  events,
  itemComponents,
  items,
  itemStatusLogs,
  partnerRuleProductSizes,
  partnerRuleProducts,
  partnerVariants,
} from '../db/schema'
import { invoicedSubmissionIds } from './invoice-queries'
import { recalculateOrderStatuses } from './order-status-queries'
import type { OrderTx } from './order-status-queries'
import {
  findRuleForVariant,
  isProductInEvent,
  loadVariantInfo,
  variantItemName,
} from './partner-paket-queries'
import { ruleCoversVariant } from './partner-pricing'
import { displayItemName } from './partner-item-label'
import { productSizesForRule } from './partner-rule-sizes'
import { feePerPcsOf } from './submit-queries'
import {
  analyzeHoles,
  replacementGroups,
  validateReplacement,
  validateWaive,
} from './submit-replacement'
import type {
  Hole,
  ReplacementGroup,
  ReplacementRow,
  ReplacementRowKind,
} from './submit-replacement'
import { loadGroupRows, loadSubmitStates } from './submit-replacement-groups'
import type { SubmitState } from './submit-replacement-groups'

export type HoleRef = { kind: ReplacementRowKind; id: string }

export type LoadedGroup = {
  submissionId: string
  submit: SubmitState
  rows: Array<ReplacementRow>
  holes: Array<Hole>
  group: ReplacementGroup
  /** Submit ini sedang ada di tagihan aktif. */
  invoiced: boolean
}

/**
 * Muat satu submit dan hitung status lubangnya. Baris submit dikunci, jadi
 * kirim pengganti, tidak diganti, dan penagihan untuk submit yang sama
 * berjalan berurutan.
 */
export async function loadReplacementGroup(
  tx: OrderTx,
  submissionId: string,
): Promise<LoadedGroup> {
  const [submit] = await loadSubmitStates(tx, [submissionId], { lock: true })
  if (!submit) throw new Error('Submit tidak ditemukan.')

  const rows = await loadGroupRows(tx, [submissionId])
  const holes = analyzeHoles(rows)
  const group = replacementGroups({ submits: [submit], holes }).get(submissionId)!
  const invoiced = (await invoicedSubmissionIds(tx, [submissionId])).size > 0
  return { submissionId, submit, rows, holes, group, invoiced }
}

type LocatedHole = {
  ref: HoleRef
  eventId: string
  submissionId: string
  orderId: string
  partnerVariantId: string | null
  /** Waktu masuk baris disanggah. Pengganti mengambil posisi FIFO-nya. */
  addedAt: Date
  /** Harga jual dan fee per pcs untuk barang pengganti. Null = pakai harga varian. */
  originalPrice: string | null
  fee: string
  /** Aturan paket customer tempat komponen ini berada. */
  bundleRuleId: string | null
  label: string
}

/** Cari baris disanggah beserta submit dan pesanannya. */
async function locateHole(tx: OrderTx, ref: HoleRef): Promise<LocatedHole> {
  if (ref.kind === 'satuan') {
    const [r] = await tx
      .select({
        submissionId: items.submissionId,
        orderId: items.orderId,
        partnerVariantId: items.partnerVariantId,
        createdAt: items.createdAt,
        originalPrice: items.originalPrice,
        fee: items.fee,
        name: items.name,
        isBundle: items.isBundle,
        eventId: eventSubmissions.eventId,
      })
      .from(items)
      .innerJoin(eventSubmissions, eq(eventSubmissions.id, items.submissionId))
      .where(eq(items.id, ref.id))
    if (!r || r.isBundle || !r.submissionId) {
      throw new Error('Barang yang mau diganti tidak ditemukan.')
    }
    return {
      ref,
      eventId: r.eventId,
      submissionId: r.submissionId,
      orderId: r.orderId,
      partnerVariantId: r.partnerVariantId,
      addedAt: r.createdAt,
      originalPrice: r.originalPrice,
      fee: r.fee,
      bundleRuleId: null,
      label: r.name,
    }
  }

  const [c] = await tx
    .select({
      submissionId: itemComponents.submissionId,
      partnerVariantId: itemComponents.partnerVariantId,
      addedAt: itemComponents.addedAt,
      productName: itemComponents.productName,
      size: itemComponents.size,
      variation: itemComponents.variation,
      bundleId: itemComponents.itemId,
      eventId: eventSubmissions.eventId,
    })
    .from(itemComponents)
    .innerJoin(
      eventSubmissions,
      eq(eventSubmissions.id, itemComponents.submissionId),
    )
    .where(eq(itemComponents.id, ref.id))
  if (!c || !c.submissionId) {
    throw new Error('Barang yang mau diganti tidak ditemukan.')
  }
  const bundle = await tx.query.items.findFirst({
    where: eq(items.id, c.bundleId),
    with: { components: true },
  })
  if (!bundle) throw new Error('Barang yang mau diganti tidak ditemukan.')
  return {
    ref,
    eventId: c.eventId,
    submissionId: c.submissionId,
    orderId: bundle.orderId,
    partnerVariantId: c.partnerVariantId,
    addedAt: c.addedAt,
    // Sama dengan isi paket yang kembali ke satuan saat dicek.
    originalPrice: null,
    fee: feePerPcsOf(bundle).toFixed(2),
    bundleRuleId: bundle.partnerRuleId,
    label: variantItemName(c),
  }
}

/** Cakupan produk dan ukuran satu aturan paket. */
async function loadRuleScope(tx: OrderTx, ruleId: string) {
  const products = await tx
    .select({ productId: partnerRuleProducts.partnerProductId })
    .from(partnerRuleProducts)
    .where(eq(partnerRuleProducts.ruleId, ruleId))
  const sizes = await tx
    .select()
    .from(partnerRuleProductSizes)
    .where(eq(partnerRuleProductSizes.ruleId, ruleId))
  return {
    productIds: products.map((p) => p.productId),
    productSizes: productSizesForRule(sizes, ruleId),
  }
}

/**
 * Aturan paket yang membatasi pengganti untuk lubang dari isi paket: aturan
 * paket customer-nya, atau (kalau sudah tidak ada) aturan yang mencakup varian
 * yang ditolak. Null = tidak ada batasan aturan.
 */
async function ruleForHole(
  tx: OrderTx,
  hole: LocatedHole,
  originalVariant: { productId: string; size: string | null } | undefined,
): Promise<string | null> {
  if (hole.bundleRuleId) return hole.bundleRuleId
  if (!originalVariant) return null
  const rule = await findRuleForVariant(
    tx,
    originalVariant.productId,
    originalVariant.size,
  )
  return rule?.id ?? null
}

export type ReplacementRequest = {
  hole: HoleRef
  partnerVariantId: string
  qty: number
}

/**
 * Jastiper mengirim pengganti untuk barang yang disanggah. Pengganti masuk ke
 * submit yang sama dengan barang yang ditolak, lalu submit itu dibuka lagi:
 * kembali menunggu dicek dan didahulukan di antrean. Barang lain di submit itu
 * yang sudah disetujui tidak berubah. Event harus sudah dikunci dan dicek
 * kepemilikannya oleh pemanggil.
 */
export async function sendReplacementsTx(
  tx: OrderTx,
  input: {
    eventId: string
    calendarEventId: string
    requests: Array<ReplacementRequest>
    now: Date
  },
): Promise<Array<{ submissionId: string; submitNo: number }>> {
  if (input.requests.length === 0) throw new Error('Pilih barang penggantinya dulu.')

  const located: Array<{ req: ReplacementRequest; hole: LocatedHole }> = []
  for (const req of input.requests) {
    const hole = await locateHole(tx, req.hole)
    if (hole.eventId !== input.eventId) {
      throw new Error('Barang yang mau diganti tidak ditemukan.')
    }
    located.push({ req, hole })
  }

  const variantIds = [
    ...located.map((l) => l.req.partnerVariantId),
    ...located
      .map((l) => l.hole.partnerVariantId)
      .filter((id): id is string => id !== null),
  ]
  const info = await loadVariantInfo(tx, variantIds)
  const activeRows = await tx
    .select({ id: partnerVariants.id, isActive: partnerVariants.isActive })
    .from(partnerVariants)
    .where(inArray(partnerVariants.id, [...new Set(variantIds)]))
  const active = new Set(activeRows.filter((v) => v.isActive).map((v) => v.id))
  // Permintaan untuk varian yang sama dijumlahkan sebelum dibandingkan dengan
  // stok. Stok baru benar-benar berkurang saat partner menyetujui.
  const demand = new Map<string, number>()
  for (const l of located) {
    const id = l.req.partnerVariantId
    demand.set(id, (demand.get(id) ?? 0) + l.req.qty)
  }

  const bySubmission = new Map<string, typeof located>()
  for (const l of located) {
    const list = bySubmission.get(l.hole.submissionId) ?? []
    list.push(l)
    bySubmission.set(l.hole.submissionId, list)
  }

  const ruleScopes = new Map<string, Awaited<ReturnType<typeof loadRuleScope>>>()
  const created: Array<{ submissionId: string; submitNo: number }> = []
  const affectedOrders = new Set<string>()

  for (const [submissionId, list] of bySubmission) {
    const loaded = await loadReplacementGroup(tx, submissionId)
    const holeById = new Map(loaded.holes.map((h) => [h.id, h]))
    const used = new Map<string, number>()

    for (const { req, hole } of list) {
      const variant = info.get(req.partnerVariantId)
      if (!variant || !active.has(req.partnerVariantId)) {
        throw new Error('Varian pengganti tidak ditemukan atau nonaktif.')
      }
      if (!(await isProductInEvent(tx, input.calendarEventId, variant.productId))) {
        throw new Error(`${displayItemName(variantItemName(variant))} tidak dijual di event ini.`)
      }
      if (variant.stock < (demand.get(req.partnerVariantId) ?? req.qty)) {
        throw new Error(
          variant.stock <= 0
            ? `Stok ${displayItemName(variantItemName(variant))} habis.`
            : `Stok ${displayItemName(variantItemName(variant))} tinggal ${variant.stock}.`,
        )
      }

      const analyzed = holeById.get(req.hole.id)
      const usedQty = used.get(req.hole.id) ?? 0
      const current =
        analyzed && analyzed.kind === req.hole.kind
          ? { ...analyzed, openQty: Math.max(0, analyzed.openQty - usedQty) }
          : undefined

      let variantAllowed = true
      if (current?.fromPaket) {
        const original = hole.partnerVariantId
          ? info.get(hole.partnerVariantId)
          : undefined
        const ruleId = await ruleForHole(tx, hole, original)
        if (ruleId) {
          let scope = ruleScopes.get(ruleId)
          if (!scope) {
            scope = await loadRuleScope(tx, ruleId)
            ruleScopes.set(ruleId, scope)
          }
          variantAllowed = ruleCoversVariant(scope, variant.productId, variant.size)
        }
      }

      const error = validateReplacement({
        hole: current,
        qty: req.qty,
        groupInvoiced: loaded.invoiced,
        variantAllowed,
      })
      if (error) throw new Error(error)
      used.set(req.hole.id, usedQty + req.qty)
    }

    // Pengganti masuk ke submit yang sama. Submit dibuka lagi: menunggu dicek
    // dan didahulukan. `reopened_at` yang sudah ada dipertahankan supaya urutan
    // antrean tidak berubah kalau pengganti ditambah lagi sebelum dicek.
    await tx
      .update(eventSubmissions)
      .set({
        stockCheckedAt: null,
        reopenedAt: sql`coalesce(${eventSubmissions.reopenedAt}, ${input.now})`,
      })
      .where(eq(eventSubmissions.id, submissionId))

    const inserted = await tx
      .insert(items)
      .values(
        list.map(({ req, hole }) => {
          const variant = info.get(req.partnerVariantId)!
          return {
            orderId: hole.orderId,
            name: variantItemName(variant),
            originalPrice: hole.originalPrice ?? variant.price.toString(),
            fee: hole.fee,
            qty: req.qty,
            obtained: false,
            isBundle: false,
            partnerVariantId: req.partnerVariantId,
            hpp: variant.price.toString(),
            submitStatus: 'pengajuan' as const,
            submissionId,
            createdAt: hole.addedAt,
            replacesItemId: hole.ref.kind === 'satuan' ? hole.ref.id : null,
            replacesComponentId: hole.ref.kind === 'komponen' ? hole.ref.id : null,
          }
        }),
      )
      .returning({ id: items.id, qty: items.qty })

    await tx.insert(itemStatusLogs).values(
      inserted.map((row, i) => ({
        eventId: input.eventId,
        itemId: row.id,
        componentId: null,
        submissionId,
        fromStatus: null,
        toStatus: 'pengajuan' as const,
        qty: row.qty,
        note: `pengganti untuk ${list[i].hole.label}`,
      })),
    )
    for (const { hole } of list) affectedOrders.add(hole.orderId)
    created.push({ submissionId, submitNo: loaded.submit.submitNo })
  }

  await recalculateOrderStatuses(tx, [...affectedOrders])
  return created
}

/**
 * Tandai barang disanggah sebagai tidak diganti. Dipakai jastiper, dan
 * partner saat "tagih apa adanya". Pemanggil sudah memastikan event-nya.
 */
export async function waiveHolesTx(
  tx: OrderTx,
  input: {
    eventId: string
    holes: Array<HoleRef>
    by: 'jastiper' | 'partner'
    now: Date
  },
): Promise<void> {
  if (input.holes.length === 0) return

  const bySubmission = new Map<string, Array<LocatedHole>>()
  for (const ref of input.holes) {
    const hole = await locateHole(tx, ref)
    if (hole.eventId !== input.eventId) throw new Error('Barang tidak ditemukan.')
    const list = bySubmission.get(hole.submissionId) ?? []
    list.push(hole)
    bySubmission.set(hole.submissionId, list)
  }

  const note =
    input.by === 'jastiper'
      ? 'tidak diganti (keputusan jastiper)'
      : 'tidak diganti (ditagih apa adanya oleh partner)'

  for (const [submissionId, list] of bySubmission) {
    const loaded = await loadReplacementGroup(tx, submissionId)
    const holeById = new Map(loaded.holes.map((h) => [h.id, h]))
    const itemIds: Array<string> = []
    const compIds: Array<string> = []
    const logs: Array<typeof itemStatusLogs.$inferInsert> = []

    for (const located of list) {
      const analyzed = holeById.get(located.ref.id)
      const hole =
        analyzed && analyzed.kind === located.ref.kind ? analyzed : undefined
      const error = validateWaive({ hole, groupInvoiced: loaded.invoiced })
      if (error) throw new Error(error)
      if (located.ref.kind === 'satuan') itemIds.push(located.ref.id)
      else compIds.push(located.ref.id)
      logs.push({
        eventId: input.eventId,
        itemId: located.ref.kind === 'satuan' ? located.ref.id : null,
        componentId: located.ref.kind === 'komponen' ? located.ref.id : null,
        submissionId: located.submissionId,
        fromStatus: 'disanggah',
        toStatus: 'disanggah',
        qty: hole!.openQty,
        note,
      })
    }

    if (itemIds.length > 0) {
      await tx
        .update(items)
        .set({ replacementWaivedAt: input.now })
        .where(inArray(items.id, itemIds))
    }
    if (compIds.length > 0) {
      await tx
        .update(itemComponents)
        .set({ replacementWaivedAt: input.now })
        .where(inArray(itemComponents.id, compIds))
    }
    await tx.insert(itemStatusLogs).values(logs)
  }
}

/** Event belanja milik brand, dikunci untuk perubahan submit. */
export async function lockBrandEvent(
  tx: OrderTx,
  eventId: string,
  brandId: string,
): Promise<{ id: string; calendarEventId: string | null }> {
  const [event] = await tx
    .select({ id: events.id, calendarEventId: events.calendarEventId })
    .from(events)
    .where(and(eq(events.id, eventId), eq(events.brandId, brandId)))
    .for('update')
  if (!event) throw new Error('Event tidak ditemukan')
  return event
}

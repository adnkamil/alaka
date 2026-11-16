// Data untuk halaman cek partner per submit (server-only).
// Partner hanya melihat nama produk, varian, dan jumlah. Nama pemesan dan
// harga jual jastiper tidak pernah dikirim.
import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm'
import {
  eventSubmissions,
  events,
  itemComponents,
  items,
  orders,
} from '../db/schema'
import type { OrderTx } from './order-status-queries'
import { partnerItemName, variantLabel } from './partner-item-label'
import { loadVariantInfo } from './partner-paket-queries'
import type { SubmitStatus } from './submit-status'

export type ReviewRow = {
  kind: 'satuan' | 'komponen'
  id: string
  label: string
  /** Nama produk, ukuran, dan variasi untuk tabel cek partner. */
  productName: string
  size: string | null
  variation: string | null
  /** Harga produk yang ditentukan partner (per pcs). */
  unitPrice: number
  qty: number
  status: SubmitStatus | null
  bundleId: string | null
  /** Varian katalog partner (null kalau barang tidak terhubung ke katalog). */
  partnerVariantId: string | null
  /** Stok varian saat ini (live), untuk kolom "Stok" di halaman cek. */
  stock: number | null
}

export type ReviewBundle = {
  bundleId: string
  ruleName: string | null
  rows: Array<ReviewRow>
}

export type ReviewSubmission = {
  submissionId: string
  submitNo: number
  submittedAt: Date
  satuan: Array<ReviewRow>
  paket: Array<ReviewBundle>
}

export type ReviewBrand = {
  eventId: string
  brandId: string
  submissions: Array<ReviewSubmission>
}

/** Semua submit dari satu event kalender partner, dikelompokkan per jastiper. */
export async function loadSubmissionsForPartner(
  tx: OrderTx,
  calendarEventId: string,
): Promise<Array<ReviewBrand>> {
  const eventRows = await tx
    .select({ id: events.id, brandId: events.brandId })
    .from(events)
    .where(eq(events.calendarEventId, calendarEventId))
  if (eventRows.length === 0) return []
  const eventIds = eventRows.map((e) => e.id)

  const subs = await tx
    .select()
    .from(eventSubmissions)
    .where(inArray(eventSubmissions.eventId, eventIds))
    .orderBy(asc(eventSubmissions.submitNo))
  if (subs.length === 0) return []
  const subIds = subs.map((s) => s.id)

  const satuanRows = await tx
    .select({
      id: items.id,
      name: items.name,
      qty: items.qty,
      status: items.submitStatus,
      submissionId: items.submissionId,
      partnerVariantId: items.partnerVariantId,
      orderEventId: orders.eventId,
    })
    .from(items)
    .innerJoin(orders, eq(orders.id, items.orderId))
    .where(
      and(
        inArray(items.submissionId, subIds),
        eq(items.isBundle, false),
        isNotNull(items.submitStatus),
      ),
    )

  const compRows = await tx
    .select({
      id: itemComponents.id,
      bundleId: itemComponents.itemId,
      productName: itemComponents.productName,
      size: itemComponents.size,
      variation: itemComponents.variation,
      qty: itemComponents.qty,
      status: itemComponents.submitStatus,
      submissionId: itemComponents.submissionId,
      partnerVariantId: itemComponents.partnerVariantId,
      ruleName: items.ruleName,
    })
    .from(itemComponents)
    .innerJoin(items, eq(items.id, itemComponents.itemId))
    .where(
      and(
        inArray(itemComponents.submissionId, subIds),
        isNotNull(itemComponents.submitStatus),
      ),
    )
    .orderBy(asc(itemComponents.addedAt), asc(itemComponents.id))

  const variantIds = [
    ...satuanRows.map((r) => r.partnerVariantId),
    ...compRows.map((c) => c.partnerVariantId),
  ].filter((id): id is string => !!id)
  const infoMap = await loadVariantInfo(tx, variantIds)

  const brandByEvent = new Map(eventRows.map((e) => [e.id, e.brandId]))
  const result = new Map<string, ReviewBrand>()
  for (const s of subs) {
    const brandId = brandByEvent.get(s.eventId)!
    const key = s.eventId
    if (!result.has(key)) {
      result.set(key, { eventId: s.eventId, brandId, submissions: [] })
    }
    result.get(key)!.submissions.push({
      submissionId: s.id,
      submitNo: s.submitNo,
      submittedAt: s.submittedAt,
      satuan: [],
      paket: [],
    })
  }

  const subById = new Map<string, ReviewSubmission>()
  for (const brand of result.values()) {
    for (const sub of brand.submissions) subById.set(sub.submissionId, sub)
  }

  for (const r of satuanRows) {
    const sub = r.submissionId ? subById.get(r.submissionId) : undefined
    if (!sub) continue
    const info = r.partnerVariantId ? infoMap.get(r.partnerVariantId) : undefined
    sub.satuan.push({
      kind: 'satuan',
      id: r.id,
      label: r.name,
      productName: info?.productName ?? r.name,
      size: info?.size ?? null,
      variation: info?.variation ?? null,
      unitPrice: info?.price ?? 0,
      qty: r.qty,
      status: r.status,
      bundleId: null,
      partnerVariantId: r.partnerVariantId,
      stock: info?.stock ?? null,
    })
  }

  for (const c of compRows) {
    const sub = c.submissionId ? subById.get(c.submissionId) : undefined
    if (!sub) continue
    const label = partnerItemName(
      c.productName,
      variantLabel({ size: c.size, variation: c.variation }),
    )
    let bundle = sub.paket.find((p) => p.bundleId === c.bundleId)
    if (!bundle) {
      bundle = { bundleId: c.bundleId, ruleName: c.ruleName, rows: [] }
      sub.paket.push(bundle)
    }
    const info = c.partnerVariantId ? infoMap.get(c.partnerVariantId) : undefined
    bundle.rows.push({
      kind: 'komponen',
      id: c.id,
      label,
      productName: info?.productName ?? c.productName,
      size: info?.size ?? c.size,
      variation: info?.variation ?? c.variation,
      unitPrice: info?.price ?? 0,
      qty: c.qty,
      status: c.status,
      bundleId: c.bundleId,
      partnerVariantId: c.partnerVariantId,
      stock: info?.stock ?? null,
    })
  }

  return [...result.values()]
}

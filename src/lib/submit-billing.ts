// Hitung pcs dan tagihan per submit (server-only, menerima `tx`/`db`).
// Dipakai daftar submit partner dan pembuatan tagihan, supaya nominalnya sama.
import { inArray, and, eq } from 'drizzle-orm'
import {
  eventSubmissions,
  itemComponents,
  items,
  partnerVariants,
} from '../db/schema'
import { allocateBundleBilling } from './partner-billing'
import { partnerItemName, variantLabel } from './partner-item-label'
import type { OrderTx } from './order-status-queries'

export type SubmitPcs = {
  total: number
  approved: number
  rejected: number
  cancelled: number
  pending: number
}

/** Satu baris snapshot tagihan (belum disimpan). */
export type BillingLine = {
  submissionId: string
  kind: 'satuan' | 'paket'
  label: string
  qty: number
  unitPrice: number
  amount: number
}

export type SubmitBilling = SubmitPcs & {
  approvedAmount: number
  pendingAmount: number
  lines: Array<BillingLine>
}

/** Paket yang isinya berasal dari lebih dari satu submit. */
export type CrossSubmitBundle = {
  bundleName: string
  submissions: Array<{ id: string; submitNo: number }>
}

const emptyBilling = (): SubmitBilling => ({
  total: 0,
  approved: 0,
  rejected: 0,
  cancelled: 0,
  pending: 0,
  approvedAmount: 0,
  pendingAmount: 0,
  lines: [],
})

function addPcs(
  b: SubmitBilling,
  status: string | null,
  pcs: number,
  unitPrice: number,
) {
  switch (status) {
    case 'disetujui':
      b.approved += pcs
      break
    case 'disanggah':
      b.rejected += pcs
      break
    case 'dibatalkan':
      b.cancelled += pcs
      break
    case 'pengajuan':
      b.pending += pcs
      b.pendingAmount += pcs * unitPrice
      break
    default:
      return
  }
  b.total += pcs
}

/**
 * Pcs per status, nominal tagihan, dan baris snapshot untuk tiap submit.
 * Barang satuan memakai harga satuan varian; paket lengkap memakai harga
 * paket yang dibagi ke submit asal tiap isinya (`allocateBundleBilling`).
 */
export async function loadSubmitBilling(
  tx: OrderTx,
  submissionIds: Array<string>,
): Promise<{
  bySubmission: Map<string, SubmitBilling>
  crossBundles: Array<CrossSubmitBundle>
}> {
  const bySubmission = new Map<string, SubmitBilling>(
    submissionIds.map((id) => [id, emptyBilling()]),
  )
  const crossBundles: Array<CrossSubmitBundle> = []
  if (submissionIds.length === 0) return { bySubmission, crossBundles }

  const satuan = await tx
    .select({
      name: items.name,
      qty: items.qty,
      status: items.submitStatus,
      submissionId: items.submissionId,
      variantId: items.partnerVariantId,
    })
    .from(items)
    .where(
      and(inArray(items.submissionId, submissionIds), eq(items.isBundle, false)),
    )
  // Komponen paket milik submit-submit ini, lalu semua komponen paket
  // induknya (termasuk dari submit lain) supaya status "paket lengkap" benar.
  const ownComponents = await tx
    .select({ itemId: itemComponents.itemId })
    .from(itemComponents)
    .where(inArray(itemComponents.submissionId, submissionIds))
  const bundleIds = [...new Set(ownComponents.map((c) => c.itemId))]
  const bundles = bundleIds.length
    ? await tx
        .select({
          id: items.id,
          qty: items.qty,
          hpp: items.hpp,
          ruleName: items.ruleName,
        })
        .from(items)
        .where(inArray(items.id, bundleIds))
    : []
  const components = bundleIds.length
    ? await tx
        .select({
          itemId: itemComponents.itemId,
          qty: itemComponents.qty,
          status: itemComponents.submitStatus,
          submissionId: itemComponents.submissionId,
          variantId: itemComponents.partnerVariantId,
          productName: itemComponents.productName,
          size: itemComponents.size,
          variation: itemComponents.variation,
        })
        .from(itemComponents)
        .where(inArray(itemComponents.itemId, bundleIds))
    : []

  const variantIds = [
    ...new Set(
      [...satuan, ...components]
        .map((r) => r.variantId)
        .filter((v): v is string => v !== null),
    ),
  ]
  const priceByVariant = new Map<string, number>()
  if (variantIds.length > 0) {
    const prices = await tx
      .select({ id: partnerVariants.id, price: partnerVariants.price })
      .from(partnerVariants)
      .where(inArray(partnerVariants.id, variantIds))
    for (const p of prices) priceByVariant.set(p.id, Number(p.price))
  }
  const priceOf = (variantId: string | null) =>
    variantId ? (priceByVariant.get(variantId) ?? 0) : 0

  for (const r of satuan) {
    const b = r.submissionId ? bySubmission.get(r.submissionId) : undefined
    if (!b || !r.submissionId) continue
    const price = priceOf(r.variantId)
    addPcs(b, r.status, r.qty, price)
    if (r.status === 'disetujui') {
      b.approvedAmount += r.qty * price
      b.lines.push({
        submissionId: r.submissionId,
        kind: 'satuan',
        label: r.name,
        qty: r.qty,
        unitPrice: price,
        amount: r.qty * price,
      })
    }
  }

  // Nomor submit dari submit lain yang ikut berbagi paket.
  const otherIds = [
    ...new Set(
      components
        .map((c) => c.submissionId)
        .filter((id): id is string => id !== null),
    ),
  ]
  const submitNoById = new Map<string, number>()
  if (otherIds.length > 0) {
    const rows = await tx
      .select({ id: eventSubmissions.id, submitNo: eventSubmissions.submitNo })
      .from(eventSubmissions)
      .where(inArray(eventSubmissions.id, otherIds))
    for (const r of rows) submitNoById.set(r.id, r.submitNo)
  }

  for (const bundle of bundles) {
    const comps = components.filter((c) => c.itemId === bundle.id)
    const bundleName = bundle.ruleName ?? 'Paket'
    const labelOf = (c: (typeof comps)[number]) =>
      partnerItemName(
        c.productName,
        variantLabel({ size: c.size, variation: c.variation }),
      )
    for (const c of comps) {
      const b = c.submissionId ? bySubmission.get(c.submissionId) : undefined
      if (b) addPcs(b, c.status, bundle.qty * c.qty, priceOf(c.variantId))
    }

    const spanIds = [
      ...new Set(
        comps
          .map((c) => c.submissionId)
          .filter((id): id is string => id !== null),
      ),
    ]
    if (spanIds.length > 1) {
      crossBundles.push({
        bundleName,
        submissions: spanIds.map((id) => ({
          id,
          submitNo: submitNoById.get(id) ?? 0,
        })),
      })
    }

    const allocated = allocateBundleBilling({
      bundleQty: bundle.qty,
      bundlePrice: bundle.hpp === null ? null : Number(bundle.hpp),
      components: comps.map((c) => ({
        submissionId: c.submissionId,
        qty: c.qty,
        status: c.status,
        unitPrice: priceOf(c.variantId),
      })),
    })
    for (const [submissionId, amount] of allocated) {
      const b = bySubmission.get(submissionId)
      if (b) b.approvedAmount += amount
    }

    const complete =
      comps.length > 0 && comps.every((c) => c.status === 'disetujui')
    if (complete) {
      for (const [submissionId, amount] of allocated) {
        const b = bySubmission.get(submissionId)
        if (!b) continue
        const own = comps.filter((c) => c.submissionId === submissionId)
        b.lines.push({
          submissionId,
          kind: 'paket',
          label: `${bundleName}: ${own.map(labelOf).join(' + ')}`,
          qty: bundle.qty,
          unitPrice: Math.round((amount / bundle.qty) * 100) / 100,
          amount,
        })
      }
    } else {
      // Paket belum lengkap: isi yang disetujui ditagih per satuan.
      for (const c of comps) {
        if (c.status !== 'disetujui' || !c.submissionId) continue
        const b = bySubmission.get(c.submissionId)
        if (!b) continue
        const price = priceOf(c.variantId)
        const qty = bundle.qty * c.qty
        b.lines.push({
          submissionId: c.submissionId,
          kind: 'satuan',
          label: labelOf(c),
          qty,
          unitPrice: price,
          amount: qty * price,
        })
      }
    }
  }

  return { bySubmission, crossBundles }
}

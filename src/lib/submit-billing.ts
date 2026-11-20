// Hitung pcs dan tagihan per submit (server-only, menerima `tx`/`db`).
// Dipakai daftar submit partner dan pembuatan tagihan, supaya nominalnya sama.
//
// Partner menghitung per jastiper, tidak per pesanan: barang satuan dan isi
// paket pesanan customer sama-sama dihitung sebagai pcs dengan harga satuan
// varian. Pemaketan menurut aturan partner dilakukan sesudahnya, atas semua pcs
// di satu tagihan (`invoice-pooling-queries.ts`).
import { inArray, and, eq } from 'drizzle-orm'
import { itemComponents, items, partnerVariants } from '../db/schema'
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
  /** Kunci sumber pcs (id barang satuan atau id isi paket) untuk pemaketan. */
  itemId?: string
  /** Alasan baris satuan ini tidak jadi paket. Diisi saat pemaketan. */
  note?: string
}

/** Pcs disetujui yang bisa dipaketkan saat menagih. */
export type PoolableSingle = {
  /** Id barang satuan atau id isi paket pesanan. */
  itemId: string
  submissionId: string
  label: string
  variantId: string
  qty: number
  unitPrice: number
  addedAt: Date
}

export type SubmitBilling = SubmitPcs & {
  approvedAmount: number
  pendingAmount: number
  lines: Array<BillingLine>
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
 * Pcs per status, nominal tagihan, dan baris snapshot untuk tiap submit, semua
 * dengan harga satuan varian saat ini. `poolable` berisi pcs disetujui yang
 * bisa dijadikan paket menurut aturan partner.
 */
export async function loadSubmitBilling(
  tx: OrderTx,
  submissionIds: Array<string>,
): Promise<{
  bySubmission: Map<string, SubmitBilling>
  poolable: Array<PoolableSingle>
}> {
  const bySubmission = new Map<string, SubmitBilling>(
    submissionIds.map((id) => [id, emptyBilling()]),
  )
  const poolable: Array<PoolableSingle> = []
  if (submissionIds.length === 0) return { bySubmission, poolable }

  const satuan = await tx
    .select({
      id: items.id,
      createdAt: items.createdAt,
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
  // Isi paket pesanan yang diajukan lewat submit-submit ini. Jumlah pcs-nya
  // = jumlah paket × qty isi.
  const components = await tx
    .select({
      id: itemComponents.id,
      bundleQty: items.qty,
      qty: itemComponents.qty,
      status: itemComponents.submitStatus,
      submissionId: itemComponents.submissionId,
      variantId: itemComponents.partnerVariantId,
      productName: itemComponents.productName,
      size: itemComponents.size,
      variation: itemComponents.variation,
      addedAt: itemComponents.addedAt,
    })
    .from(itemComponents)
    .innerJoin(items, eq(items.id, itemComponents.itemId))
    .where(inArray(itemComponents.submissionId, submissionIds))

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

  const sources = [
    ...satuan.map((r) => ({
      key: r.id,
      submissionId: r.submissionId,
      status: r.status,
      label: r.name,
      variantId: r.variantId,
      qty: r.qty,
      addedAt: r.createdAt,
    })),
    ...components.map((c) => ({
      key: c.id,
      submissionId: c.submissionId,
      status: c.status,
      label: partnerItemName(
        c.productName,
        variantLabel({ size: c.size, variation: c.variation }),
      ),
      variantId: c.variantId,
      qty: c.bundleQty * c.qty,
      addedAt: c.addedAt,
    })),
  ]

  for (const r of sources) {
    const b = r.submissionId ? bySubmission.get(r.submissionId) : undefined
    if (!b || !r.submissionId) continue
    const price = priceOf(r.variantId)
    addPcs(b, r.status, r.qty, price)
    if (r.status !== 'disetujui' || r.qty <= 0) continue
    b.approvedAmount += r.qty * price
    b.lines.push({
      submissionId: r.submissionId,
      kind: 'satuan',
      label: r.label,
      qty: r.qty,
      unitPrice: price,
      amount: r.qty * price,
      itemId: r.key,
    })
    if (r.variantId) {
      poolable.push({
        itemId: r.key,
        submissionId: r.submissionId,
        label: r.label,
        variantId: r.variantId,
        qty: r.qty,
        unitPrice: price,
        addedAt: r.addedAt,
      })
    }
  }

  return { bySubmission, poolable }
}

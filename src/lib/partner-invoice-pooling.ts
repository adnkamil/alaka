// Pemaketan tagihan partner. Partner menghitung per jastiper: semua pcs yang
// disetujui di satu tagihan (satuan maupun isi paket pesanan customer)
// dikumpulkan per aturan paket, lalu dibentuk paket FIFO dengan harga aturan
// saat menagih. Bentuk pesanan customer tidak dipakai dan tidak berubah.
// Logika murni, tanpa database.
import { allocateBundleBilling } from './partner-billing'
import { formBundles } from './partner-bundle-fifo'
import { ruleCoversVariant } from './partner-pricing'
import type { RuleProductSizes } from './partner-pricing'

/** Aturan paket aktif milik partner. Pemanggil hanya mengirim aturan yang aktif. */
export type PoolRule = {
  id: string
  name: string
  /** Jumlah pcs per paket. */
  minQty: number
  /** HPP per paket. */
  bundlePrice: number
  productIds: Array<string>
  productSizes?: RuleProductSizes
}

/** Sejumlah pcs disetujui dari satu sumber (barang satuan atau isi paket pesanan). */
export type PoolSingle = {
  /** Kunci unik sumber: id barang satuan atau id isi paket. */
  itemId: string
  submissionId: string
  /** Nama tampil, mis. "Kingu Lyra Skirt (M / Dark)". */
  label: string
  productId: string
  size: string | null
  qty: number
  /** Harga satuan varian. */
  unitPrice: number
  /** Waktu barang masuk. Dasar urutan FIFO. */
  addedAt: Date
}

export type PooledPart = {
  itemId: string
  submissionId: string
  label: string
  qty: number
  unitPrice: number
}

/** Satu baris tagihan hasil pemaketan, untuk satu submit asal. */
export type PooledLine = {
  submissionId: string
  label: string
  qty: number
  unitPrice: number
  amount: number
}

export type PooledBundle = {
  ruleId: string
  ruleName: string
  bundlePrice: number
  parts: Array<PooledPart>
  /** Harga paket yang dibagi ke submit asal. Jumlahnya sama dengan `bundlePrice`. */
  amountBySubmission: Map<string, number>
  /** Baris tagihan per submit asal. */
  lines: Array<PooledLine>
  /** Jumlah harga satuan isi paket, sebelum dijadikan paket. */
  unitTotal: number
}

export type PoolResult = {
  bundles: Array<PooledBundle>
  /** itemId -> jumlah pcs yang sudah masuk paket. Sisanya tetap satuan. */
  consumed: Map<string, number>
  /** Jumlah harga satuan dikurangi harga paket, seluruh paket. Bisa negatif. */
  saving: number
  /**
   * itemId -> alasan sisa pcs-nya ditagih satuan: di luar aturan paket, atau
   * kurang pcs untuk paket berikutnya. Hanya untuk barang yang masih punya sisa.
   */
  notes: Map<string, string>
}

function ruleFor(
  rules: Array<PoolRule>,
  productId: string,
  size: string | null,
): PoolRule | null {
  return rules.find((r) => ruleCoversVariant(r, productId, size)) ?? null
}

/**
 * Bentuk paket dari pcs yang disetujui, tanpa melihat asal pesanannya.
 * - Pcs dikelompokkan per aturan lewat produk dan ukuran. Pcs di luar semua
 *   aturan tidak disentuh.
 * - Tiap kelompok dipaketkan FIFO per `minQty` dengan harga aturan. Sisa kurang
 *   dari `minQty` tetap satuan.
 */
export function poolSinglesIntoBundles(
  singles: Array<PoolSingle>,
  rules: Array<PoolRule>,
): PoolResult {
  const groups = new Map<string, { rule: PoolRule; rows: Array<PoolSingle> }>()
  const notes = new Map<string, string>()
  for (const s of singles) {
    if (s.qty <= 0) continue
    const rule = ruleFor(rules, s.productId, s.size)
    if (!rule) {
      notes.set(s.itemId, NOTE_OUTSIDE_RULE)
      continue
    }
    const group = groups.get(rule.id) ?? { rule, rows: [] }
    group.rows.push(s)
    groups.set(rule.id, group)
  }

  const bundles: Array<PooledBundle> = []
  const consumed = new Map<string, number>()
  let saving = 0

  for (const { rule, rows } of groups.values()) {
    const byId = new Map(rows.map((r) => [r.itemId, r]))
    const plan = formBundles(
      rows.map((r) => ({ itemId: r.itemId, qty: r.qty, addedAt: r.addedAt })),
      rule.minQty,
    )
    for (const planned of plan.bundles) {
      const parts: Array<PooledPart> = planned.parts.map((p) => {
        const src = byId.get(p.itemId)!
        return {
          itemId: p.itemId,
          submissionId: src.submissionId,
          label: src.label,
          qty: p.qty,
          unitPrice: src.unitPrice,
        }
      })
      const unitTotal = parts.reduce((sum, p) => sum + p.qty * p.unitPrice, 0)

      const amountBySubmission = allocateBundleBilling({
        bundleQty: 1,
        bundlePrice: rule.bundlePrice,
        components: parts.map((p) => ({
          submissionId: p.submissionId,
          qty: p.qty,
          status: 'disetujui' as const,
          unitPrice: p.unitPrice,
        })),
      })
      bundles.push({
        ruleId: rule.id,
        ruleName: rule.name,
        bundlePrice: rule.bundlePrice,
        parts,
        amountBySubmission,
        lines: pooledLines(rule.name, parts, amountBySubmission),
        unitTotal,
      })
      saving += unitTotal - rule.bundlePrice
      for (const p of parts) {
        consumed.set(p.itemId, (consumed.get(p.itemId) ?? 0) + p.qty)
      }
    }
  }

  // Sisa pcs di tiap kelompok ditagih satuan karena belum cukup untuk paket.
  for (const { rule, rows } of groups.values()) {
    const left = rows.reduce(
      (sum, r) => sum + r.qty - (consumed.get(r.itemId) ?? 0),
      0,
    )
    if (left <= 0) continue
    const note = `Kurang ${rule.minQty - left} pcs lagi untuk ${rule.name}`
    for (const r of rows) {
      if (r.qty - (consumed.get(r.itemId) ?? 0) > 0) notes.set(r.itemId, note)
    }
  }

  return { bundles, consumed, saving, notes }
}

/** Alasan pcs ditagih satuan: produknya tidak masuk aturan paket mana pun. */
export const NOTE_OUTSIDE_RULE = 'Di luar aturan paket'

/** Satu baris per submit asal; isi yang sama dari satu submit digabung "2× ...". */
function pooledLines(
  ruleName: string,
  parts: Array<PooledPart>,
  amountBySubmission: Map<string, number>,
): Array<PooledLine> {
  const order: Array<string> = []
  const labelQty = new Map<string, Map<string, number>>()
  for (const p of parts) {
    let labels = labelQty.get(p.submissionId)
    if (!labels) {
      labels = new Map()
      labelQty.set(p.submissionId, labels)
      order.push(p.submissionId)
    }
    labels.set(p.label, (labels.get(p.label) ?? 0) + p.qty)
  }

  return order.map((submissionId) => {
    const labels = [...labelQty.get(submissionId)!].map(([label, qty]) =>
      qty > 1 ? `${qty}× ${label}` : label,
    )
    const amount = amountBySubmission.get(submissionId) ?? 0
    return {
      submissionId,
      label: `${ruleName}: ${labels.join(' + ')}`,
      qty: 1,
      unitPrice: amount,
      amount,
    }
  })
}

/** Bentuk minimal baris tagihan yang dipahami `applyPoolToBilling`. */
export type PoolableLine = {
  submissionId: string
  kind: 'satuan' | 'paket'
  label: string
  qty: number
  unitPrice: number
  amount: number
  itemId?: string
  /** Alasan baris satuan ini tidak jadi paket. */
  note?: string
}

export type PoolableBilling = {
  approvedAmount: number
  lines: Array<PoolableLine>
}

/**
 * Terapkan hasil pemaketan ke tagihan per submit: baris satuan yang sudah
 * masuk paket dikurangi (dihapus kalau habis), baris paket ditambahkan, dan
 * `approvedAmount` disesuaikan. Jumlah pcs tidak berubah. Objek asal tidak
 * diubah.
 */
export function applyPoolToBilling<TBilling extends PoolableBilling>(
  bySubmission: Map<string, TBilling>,
  pool: PoolResult,
): Map<string, TBilling> {
  const remaining = new Map(pool.consumed)
  const result = new Map<string, TBilling>()

  for (const [submissionId, billing] of bySubmission) {
    let approvedAmount = billing.approvedAmount
    const lines: Array<PoolableLine> = []
    for (const line of billing.lines) {
      const left = line.itemId ? (remaining.get(line.itemId) ?? 0) : 0
      if (line.kind !== 'satuan' || left <= 0) {
        const note = line.itemId ? pool.notes.get(line.itemId) : undefined
        lines.push(note && line.kind === 'satuan' ? { ...line, note } : line)
        continue
      }
      const take = Math.min(line.qty, left)
      remaining.set(line.itemId!, left - take)
      approvedAmount -= take * line.unitPrice
      const qty = line.qty - take
      if (qty > 0) {
        lines.push({
          ...line,
          qty,
          amount: qty * line.unitPrice,
          note: pool.notes.get(line.itemId!) ?? line.note,
        })
      }
    }
    result.set(submissionId, { ...billing, approvedAmount, lines })
  }

  for (const bundle of pool.bundles) {
    for (const line of bundle.lines) {
      const billing = result.get(line.submissionId)
      if (!billing) continue
      billing.approvedAmount += line.amount
      billing.lines.push({ ...line, kind: 'paket' })
    }
  }
  return result
}

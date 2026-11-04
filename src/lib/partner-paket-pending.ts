// Pcs yang masih menunggu untuk membentuk paket, per aturan, di satu pesanan.
// Logika murni: dipakai loader event untuk catatan "N pcs lagi untuk ...".
import { formBundles, type FifoRow } from './partner-bundle-fifo'

export type PendingSingle = FifoRow & {
  ruleId: string
  ruleName: string
  minQty: number
}

export type PendingRuleInfo = {
  ruleId: string
  ruleName: string
  minQty: number
  pendingPcs: number
  pcsShort: number
}

/** Kelompokkan barang satuan per aturan, lalu hitung sisa yang belum cukup paket. */
export function computePendingRules(singles: Array<PendingSingle>): Array<PendingRuleInfo> {
  const byRule = new Map<string, Array<PendingSingle>>()
  for (const s of singles) {
    const list = byRule.get(s.ruleId) ?? []
    list.push(s)
    byRule.set(s.ruleId, list)
  }

  const result: Array<PendingRuleInfo> = []
  for (const [ruleId, rows] of byRule) {
    const { minQty, ruleName } = rows[0]
    const plan = formBundles(rows, minQty)
    if (plan.pendingPcs > 0) {
      result.push({
        ruleId,
        ruleName,
        minQty,
        pendingPcs: plan.pendingPcs,
        pcsShort: plan.pcsShort,
      })
    }
  }
  return result
}

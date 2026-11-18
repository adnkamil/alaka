import { eq, inArray } from 'drizzle-orm'
import {
  items,
  partnerPricingRules,
  partnerRuleProducts,
  partnerRuleProductSizes,
} from '../db/schema'
import type { db } from '../db'
import type { MergePlan } from './partner-rule-merge'

type Tx = Pick<typeof db, 'insert' | 'update' | 'delete'>

/**
 * Menjalankan satu rencana gabung di dalam transaksi pemanggil: produk dan
 * ukuran semua aturan di grup dipindah ke aturan yang dipertahankan, barang
 * pesanan yang memakai aturan lain dialihkan, lalu aturan lain dihapus.
 * Snapshot nama/pcs/HPP di barang pesanan tidak diubah.
 */
export async function applyRuleMerge(tx: Tx, plan: MergePlan): Promise<{ itemsMoved: number }> {
  if (plan.productIds.length > 0) {
    await tx
      .insert(partnerRuleProducts)
      .values(plan.productIds.map((partnerProductId) => ({ ruleId: plan.keeperId, partnerProductId })))
      .onConflictDoNothing()
  }
  const sizeRows = Object.entries(plan.productSizes).flatMap(([partnerProductId, names]) =>
    names.map((sizeName) => ({ ruleId: plan.keeperId, partnerProductId, sizeName })),
  )
  if (sizeRows.length > 0) {
    await tx.insert(partnerRuleProductSizes).values(sizeRows).onConflictDoNothing()
  }
  const moved = await tx
    .update(items)
    .set({ partnerRuleId: plan.keeperId })
    .where(inArray(items.partnerRuleId, plan.mergedIds))
    .returning({ id: items.id })
  await tx
    .update(partnerPricingRules)
    .set({ name: plan.newName })
    .where(eq(partnerPricingRules.id, plan.keeperId))
  // Baris produk dan ukuran aturan yang digabung ikut terhapus (cascade).
  await tx.delete(partnerPricingRules).where(inArray(partnerPricingRules.id, plan.mergedIds))
  return { itemsMoved: moved.length }
}

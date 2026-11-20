// Penggabungan aturan paket yang setara. Sejak ukuran dipilih per produk,
// aturan dengan jumlah pcs dan harga paket yang sama tidak perlu dipisah hanya
// karena rentang ukurannya beda. Logika murni; eksekusinya ada di
// scripts/merge-partner-rules.ts.

export type MergeRule = {
  id: string
  partnerId: string
  name: string
  minQty: number
  bundlePrice: string | number
  isActive: boolean
  position: number
  createdAt: Date | string
}

export type MergeLink = { ruleId: string; partnerProductId: string }
export type MergeSizeRow = { ruleId: string; partnerProductId: string; sizeName: string }

export type MergePlan = {
  partnerId: string
  /** Aturan yang dipertahankan. */
  keeperId: string
  keeperName: string
  /** Nama baru aturan yang dipertahankan, tanpa keterangan rentang ukuran. */
  newName: string
  /** Aturan yang digabung ke keeper lalu dihapus. */
  mergedIds: Array<string>
  mergedNames: Array<string>
  /** Gabungan produk dari semua aturan di grup. */
  productIds: Array<string>
  /** Gabungan ukuran per produk dari semua aturan di grup. */
  productSizes: Record<string, Array<string>>
}

/** "100K / 2pcs (S, M, L)" -> "100K / 2pcs". Nama tanpa kurung tetap. */
export function stripSizeSuffix(name: string): string {
  const stripped = name.replace(/\s*\([^)]*\)\s*$/, '').trim()
  return stripped === '' ? name : stripped
}

function time(value: Date | string): number {
  return new Date(value).getTime()
}

/**
 * Kelompokkan aturan yang setara: partner, jumlah pcs, harga paket, dan status
 * aktif yang sama. Tiap kelompok berisi dua aturan atau lebih menjadi satu
 * rencana gabung. Aturan nonaktif hanya digabung dengan sesama nonaktif.
 */
export function planRuleMerges(
  rules: Array<MergeRule>,
  links: Array<MergeLink>,
  sizes: Array<MergeSizeRow>,
): Array<MergePlan> {
  const groups = new Map<string, Array<MergeRule>>()
  for (const rule of rules) {
    const key = [rule.partnerId, rule.minQty, Number(rule.bundlePrice), rule.isActive].join('|')
    groups.set(key, [...(groups.get(key) ?? []), rule])
  }

  const plans: Array<MergePlan> = []
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const ordered = [...group].sort(
      (a, b) =>
        a.position - b.position ||
        time(a.createdAt) - time(b.createdAt) ||
        a.id.localeCompare(b.id),
    )
    const [keeper, ...rest] = ordered
    const ids = new Set(ordered.map((r) => r.id))

    const productIds = [
      ...new Set(links.filter((l) => ids.has(l.ruleId)).map((l) => l.partnerProductId)),
    ]
    const productSizes: Record<string, Array<string>> = {}
    for (const row of sizes) {
      if (!ids.has(row.ruleId)) continue
      const list = (productSizes[row.partnerProductId] ??= [])
      if (!list.includes(row.sizeName)) list.push(row.sizeName)
    }

    plans.push({
      partnerId: keeper.partnerId,
      keeperId: keeper.id,
      keeperName: keeper.name,
      newName: stripSizeSuffix(keeper.name),
      mergedIds: rest.map((r) => r.id),
      mergedNames: rest.map((r) => r.name),
      productIds,
      productSizes,
    })
  }
  return plans
}

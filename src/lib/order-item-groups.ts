// Pembagian dan label item pesanan untuk tampilan "barang satuan" dan "paket".
// Logika murni, tanpa db dan tanpa React.
import { partnerItemName, variantLabel } from './partner-item-label'

export type OrderItemLike = {
  isBundle: boolean
  partnerRuleId: string | null
  ruleName: string | null
  fee: number | string
}

export function splitOrderItems<T extends { isBundle: boolean }>(items: Array<T>) {
  return {
    singles: items.filter((i) => !i.isBundle),
    bundles: items.filter((i) => i.isBundle),
  }
}

/** Fee 0 berarti belum ditentukan jastiper, sehingga perlu flag. */
export function isFeeUndecided(item: { fee: number | string }): boolean {
  return Number(item.fee) === 0
}

/** Label aturan paket. Kalau aturan sudah dihapus partner, paket diberi label "aturan tidak aktif". */
export function bundleRuleLabel(item: OrderItemLike): string {
  if (item.partnerRuleId === null) return 'aturan tidak aktif'
  return item.ruleName ?? 'Paket'
}

/** Catatan barang satuan yang belum cukup untuk paket. */
export function pendingNoteText(p: { pcsShort: number; ruleName: string }): string {
  return `${p.pcsShort} pcs lagi untuk ${p.ruleName}`
}

/** Nama komponen paket, misalnya "Kana Longsleeve Set (S / Marine Cove)". */
export function componentDisplayName(c: {
  productName: string
  size: string | null
  variation: string | null
}): string {
  return partnerItemName(
    c.productName,
    variantLabel({ size: c.size, variation: c.variation }),
  )
}

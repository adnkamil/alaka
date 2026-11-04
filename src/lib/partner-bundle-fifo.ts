// Pembentukan paket dari barang satuan dengan aturan yang sama (FIFO).
// Fungsi murni: tidak menyentuh database. Penyimpanan dilakukan pemanggilnya.

export type FifoRow = {
  itemId: string
  qty: number
  addedAt: Date
}

export type FifoPart = { itemId: string; qty: number }

export type FifoResult = {
  /** Paket yang terbentuk, masing-masing berisi tepat `minQty` pcs. */
  bundles: Array<{ parts: Array<FifoPart> }>
  /** Sisa barang satuan yang belum cukup untuk paket. */
  leftover: Array<FifoPart>
  /** Jumlah pcs sisa satuan. */
  pendingPcs: number
  /** Pcs yang masih kurang untuk paket berikutnya. 0 jika tidak ada sisa. */
  pcsShort: number
}

/**
 * Bentuk paket dari daftar barang satuan dengan aturan yang sama. Barang diambil
 * dari yang paling lama masuk (FIFO). Satu baris boleh dipecah: sebagian pcs
 * masuk paket, sisanya tetap satuan.
 */
export function formBundles(rows: Array<FifoRow>, minQty: number): FifoResult {
  if (!Number.isInteger(minQty) || minQty <= 0) {
    throw new Error('minQty harus bilangan bulat positif')
  }

  const queue = rows
    .filter((r) => r.qty > 0)
    .slice()
    .sort((a, b) => {
      const diff = a.addedAt.getTime() - b.addedAt.getTime()
      if (diff !== 0) return diff
      return a.itemId < b.itemId ? -1 : a.itemId > b.itemId ? 1 : 0
    })
    .map((r) => ({ itemId: r.itemId, qty: r.qty }))

  const bundles: FifoResult['bundles'] = []

  const poolTotal = () => queue.reduce((sum, r) => sum + r.qty, 0)

  while (poolTotal() >= minQty) {
    let need = minQty
    const parts: Array<FifoPart> = []
    while (need > 0) {
      const head = queue[0]
      const take = Math.min(head.qty, need)
      parts.push({ itemId: head.itemId, qty: take })
      head.qty -= take
      need -= take
      if (head.qty === 0) queue.shift()
    }
    bundles.push({ parts })
  }

  const leftover = queue.filter((r) => r.qty > 0)
  const pendingPcs = leftover.reduce((sum, r) => sum + r.qty, 0)
  return {
    bundles,
    leftover,
    pendingPcs,
    pcsShort: pendingPcs > 0 ? minQty - pendingPcs : 0,
  }
}

// Baris paket (bundle) partner tidak boleh digabung atau dihapus lewat jalur
// umum (form pesanan, impor, merge). Perubahan isi paket dilakukan lewat aksi
// khusus per komponen. Barang satuan tidak terkunci meskipun produknya punya aturan.

export type LockableItem = {
  isBundle: boolean
}

export function isLockedBundle(item: LockableItem): boolean {
  return item.isBundle
}

export function partitionLockedItems<T extends LockableItem>(
  rows: Array<T>,
): { locked: Array<T>; editable: Array<T> } {
  const locked: Array<T> = []
  const editable: Array<T> = []
  for (const row of rows) {
    if (isLockedBundle(row)) locked.push(row)
    else editable.push(row)
  }
  return { locked, editable }
}

/** Total tagihan baris: (harga jual + fee) * qty. Sama dengan rumus pesanan. */
export function lineTotal(row: {
  originalPrice: number | string
  fee: number | string
  qty: number
}): number {
  return (Number(row.originalPrice) + Number(row.fee)) * row.qty
}

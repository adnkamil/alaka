// Baris bundle dari aturan paket partner dikunci: isi dan jumlah paketnya tidak
// boleh diubah lewat form edit biasa. Harga jual dan fee tetap bisa diubah lewat
// aksi khusus. Helper ini dipakai updateOrder dan merge supaya baris terkunci
// tidak ikut terhapus atau diisi ulang.

export type LockableItem = {
  partnerRuleId: string | null
}

export function isLockedBundle(item: LockableItem): boolean {
  return item.partnerRuleId !== null
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

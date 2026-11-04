// Menjaga waktu masuk (createdAt) barang satuan saat pesanan ditulis ulang.
// Dipakai supaya urutan FIFO pembentukan paket tidak berubah ketika form pesanan
// menghapus lalu menulis ulang barang satuan. Logika murni.

export type PreviousItem = {
  name: string
  partnerVariantId: string | null
  createdAt: Date
}

/**
 * Untuk setiap baris baru, pakai createdAt dari baris lama yang punya nama dan
 * varian yang sama. Setiap baris lama hanya dipakai sekali. Baris tanpa pasangan
 * tidak diberi createdAt (default waktu sekarang).
 */
export function carryCreatedAt<T extends { name: string; partnerVariantId?: string | null }>(
  previous: Array<PreviousItem>,
  rows: Array<T>,
): Array<T & { createdAt?: Date }> {
  const pool = previous.map((p) => ({ ...p }))
  return rows.map((row) => {
    const idx = pool.findIndex(
      (p) => p.name === row.name && p.partnerVariantId === (row.partnerVariantId ?? null),
    )
    if (idx < 0) return { ...row }
    const [match] = pool.splice(idx, 1)
    return { ...row, createdAt: match.createdAt }
  })
}

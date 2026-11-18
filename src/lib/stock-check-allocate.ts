// Pembagian otomatis stok per baris submit (murni, tanpa db, bisa diuji).
// Baris diproses sesuai urutan yang diberikan. Baris yang varian-nya punya
// stok diambil sebanyak stok yang tersisa, sisanya dibiarkan kurang. Baris
// tanpa varian katalog tidak memakai stok, jadi selalu disetujui penuh.

export type AllocRow = {
  key: string
  variantId: string | null | undefined
  qty: number
}

export function allocateAutoApprovals(
  rows: Array<AllocRow>,
  stockByVariant: Map<string, number>,
): Map<string, number> {
  const remaining = new Map(stockByVariant)
  const approvals = new Map<string, number>()
  for (const row of rows) {
    if (!row.variantId) {
      approvals.set(row.key, row.qty)
      continue
    }
    const stock = Math.max(0, remaining.get(row.variantId) ?? 0)
    const approved = Math.min(Math.max(row.qty, 0), stock)
    remaining.set(row.variantId, stock - approved)
    approvals.set(row.key, approved)
  }
  return approvals
}

/** Denyut lebih tua dari ini dianggap proses sudah mati. Dipakai di server dan tes. */
export const HEARTBEAT_STALE_MS = 60_000

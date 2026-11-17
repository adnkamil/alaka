// Logika stok varian partner. Bagian murni (tanpa db) bisa diuji; bagian db
// dipakai saat partner menekan "Selesai dicek". Stok hanya berkurang di sana,
// sebesar jumlah yang disetujui; saat jastiper menambah pesanan stok hanya
// dicek, tidak dikurangi.
import { inArray, sql } from 'drizzle-orm'
import { partnerVariants } from '../db/schema'
import type { OrderTx } from './order-status-queries'

export type StockShortage = {
  variantId: string
  name: string
  stock: number
  requested: number
}

/** Jumlahkan kebutuhan per varian. Baris tanpa varian atau qty <= 0 diabaikan. */
export function aggregateStockDemand(
  entries: Array<{ variantId: string | null | undefined; qty: number }>,
): Map<string, number> {
  const demand = new Map<string, number>()
  for (const { variantId, qty } of entries) {
    if (!variantId || qty <= 0) continue
    demand.set(variantId, (demand.get(variantId) ?? 0) + qty)
  }
  return demand
}

/** Varian yang kebutuhannya melebihi stok. Varian tak dikenal dianggap stok 0. */
export function findStockShortages(
  demand: Map<string, number>,
  available: Map<string, { name: string; stock: number }>,
): Array<StockShortage> {
  const shortages: Array<StockShortage> = []
  for (const [variantId, requested] of demand) {
    const info = available.get(variantId)
    const stock = info?.stock ?? 0
    if (requested > stock) {
      shortages.push({ variantId, name: info?.name ?? 'Barang', stock, requested })
    }
  }
  return shortages
}

export function formatStockShortages(shortages: Array<StockShortage>): string {
  return shortages
    .map((s) =>
      s.stock <= 0
        ? `${s.name} habis`
        : `${s.name}: stok tinggal ${s.stock}, diminta ${s.requested}`,
    )
    .join('; ')
}

export class StockShortageError extends Error {
  shortages: Array<StockShortage>
  constructor(prefix: string, shortages: Array<StockShortage>) {
    super(`${prefix}${formatStockShortages(shortages)}.`)
    this.shortages = shortages
  }
}

/**
 * Kembalikan stok varian dalam transaksi `tx` (kebalikan `deductVariantStock`).
 * Dipakai saat barang yang sudah disetujui partner ikut hilang, misalnya event
 * dihapus. Baris dikunci dalam urutan id yang sama dengan pengurangan.
 */
export async function restoreVariantStock(
  tx: OrderTx,
  demand: Map<string, number>,
): Promise<void> {
  const ids = [...demand.keys()].sort()
  if (ids.length === 0) return
  await tx
    .select({ id: partnerVariants.id })
    .from(partnerVariants)
    .where(inArray(partnerVariants.id, ids))
    .orderBy(partnerVariants.id)
    .for('update')
  for (const id of ids) {
    await tx
      .update(partnerVariants)
      .set({ stockQty: sql`${partnerVariants.stockQty} + ${demand.get(id)!}` })
      .where(inArray(partnerVariants.id, [id]))
  }
}

/**
 * Kurangi stok varian dalam transaksi `tx`. Baris varian dikunci
 * (FOR UPDATE) dalam urutan id supaya dua transaksi tidak saling menunggu.
 * Kalau ada yang kurang, tidak ada stok yang berubah dan error dilempar.
 */
export async function deductVariantStock(
  tx: OrderTx,
  demand: Map<string, number>,
  nameOf: (variantId: string) => string,
): Promise<void> {
  const ids = [...demand.keys()].sort()
  if (ids.length === 0) return

  const rows = await tx
    .select({ id: partnerVariants.id, stockQty: partnerVariants.stockQty })
    .from(partnerVariants)
    .where(inArray(partnerVariants.id, ids))
    .orderBy(partnerVariants.id)
    .for('update')
  const available = new Map(
    rows.map((r) => [r.id, { name: nameOf(r.id), stock: r.stockQty }]),
  )
  for (const id of ids) {
    if (!available.has(id)) available.set(id, { name: nameOf(id), stock: 0 })
  }

  const shortages = findStockShortages(demand, available)
  if (shortages.length > 0) {
    throw new StockShortageError('Stok tidak cukup: ', shortages)
  }
  for (const id of ids) {
    await tx
      .update(partnerVariants)
      .set({ stockQty: sql`${partnerVariants.stockQty} - ${demand.get(id)!}` })
      .where(inArray(partnerVariants.id, [id]))
  }
}

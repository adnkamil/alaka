// Hitung ulang total pesanan dan status pembayarannya. Tidak mengimpor db:
// menerima transaksi dari pemanggil (lihat aturan di client-bundle-safety).
import { eq, inArray } from 'drizzle-orm'
import { items, orders } from '../db/schema'
import { chunk } from './chunk'
import { derivePaymentStatus } from './order-totals'
import { lineTotal } from './partner-bundle-lock'

export type OrderTx = Parameters<
  Parameters<typeof import('../db')['db']['transaction']>[0]
>[0]

/**
 * Versi massal `recalculateOrderStatus` untuk banyak pesanan sekaligus: dua
 * query baca untuk semuanya, dan update hanya untuk pesanan yang status atau
 * jumlah bayarnya benar-benar berubah (updatedAt tidak disentuh kalau tidak ada
 * perubahan).
 */
export async function recalculateOrderStatuses(
  tx: OrderTx,
  orderIds: ReadonlyArray<string>,
) {
  for (const ids of chunk([...new Set(orderIds)], 500)) {
    const orderRows = await tx.select().from(orders).where(inArray(orders.id, ids))
    const itemRows = await tx
      .select()
      .from(items)
      .where(inArray(items.orderId, ids))
    const itemsByOrder = new Map<string, Array<(typeof itemRows)[number]>>()
    for (const row of itemRows) {
      const list = itemsByOrder.get(row.orderId) ?? []
      list.push(row)
      itemsByOrder.set(row.orderId, list)
    }
    for (const order of orderRows) {
      const total = (itemsByOrder.get(order.id) ?? []).reduce(
        (sum, row) => sum + lineTotal(row),
        0,
      )
      const paid = Math.min(Number(order.paidAmount), total)
      const status = derivePaymentStatus(paid, total)
      if (status === order.paymentStatus && paid === Number(order.paidAmount)) {
        continue
      }
      await tx
        .update(orders)
        .set({
          paymentStatus: status,
          paidAmount: paid.toString(),
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id))
    }
  }
}

/** Hitung ulang total pesanan dan status pembayarannya dari semua barang. */
export async function recalculateOrderStatus(tx: OrderTx, orderId: string) {
  const order = await tx.query.orders.findFirst({
    where: eq(orders.id, orderId),
  })
  if (!order) return
  const rows = await tx.query.items.findMany({
    where: eq(items.orderId, orderId),
  })
  const total = rows.reduce((sum, row) => sum + lineTotal(row), 0)
  const paid = Math.min(Number(order.paidAmount), total)
  await tx
    .update(orders)
    .set({
      paymentStatus: derivePaymentStatus(paid, total),
      paidAmount: paid.toString(),
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId))
}

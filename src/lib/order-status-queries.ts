// Hitung ulang total pesanan dan status pembayarannya. Tidak mengimpor db:
// menerima transaksi dari pemanggil (lihat aturan di client-bundle-safety).
import { eq } from 'drizzle-orm'
import { items, orders } from '../db/schema'
import { derivePaymentStatus } from './order-totals'
import { lineTotal } from './partner-bundle-lock'

export type OrderTx = Parameters<
  Parameters<typeof import('../db')['db']['transaction']>[0]
>[0]

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

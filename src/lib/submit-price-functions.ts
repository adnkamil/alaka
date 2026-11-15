import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getSessionUser } from './auth'
import { brandIdOf } from './brand'

/**
 * Harga jual dan fee barang yang sudah dikirim ke partner. Hanya ini yang
 * boleh berubah setelah submit. Jumlah dan nama tetap terkunci. Handler memakai
 * import dinamis supaya `db` tidak ikut ke bundle client.
 */
export const updateSubmittedItemPrice = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      itemId: z.uuid(),
      originalPrice: z.number().min(0),
      fee: z.number().min(0),
    }),
  )
  .handler(async ({ data }) => {
    const { db } = await import('../db')
    const { items } = await import('../db/schema')
    const { recalculateOrderStatus } = await import('./order-status-queries')
    const user = await getSessionUser()
    if (!user) throw new Error('Belum login')

    const item = await db.query.items.findFirst({
      where: eq(items.id, data.itemId),
      with: { order: { with: { event: true } } },
    })
    if (!item || item.order.event.brandId !== brandIdOf(user)) {
      throw new Error('Barang tidak ditemukan')
    }
    if (item.isBundle) throw new Error('Harga paket diubah lewat halaman paket.')
    if (item.submitStatus === null) {
      throw new Error('Barang ini belum dikirim. Ubah lewat form pesanan.')
    }
    await db.transaction(async (tx) => {
      await tx
        .update(items)
        .set({
          originalPrice: data.originalPrice.toFixed(2),
          fee: data.fee.toFixed(2),
        })
        .where(eq(items.id, item.id))
      await recalculateOrderStatus(tx, item.orderId)
    })
  })

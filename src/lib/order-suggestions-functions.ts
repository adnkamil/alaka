import { createServerFn } from '@tanstack/react-start'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db'
import { events, items, orders } from '../db/schema'
import { brandIdOf } from './brand'
import { getSessionUser } from './auth'

/**
 * Saran nama barang & harga asli untuk form Tambah/Edit Pesanan (dulu dihitung
 * di komponen `events.$eventId.tsx`, sekarang lewat server supaya pengambilan
 * datanya konsisten).
 *
 * Fitur ini TERBUKA untuk semua paket (termasuk FREE) — jadi tidak ada
 * pengecekan entitlement di sini.
 */
export interface OrderSuggestions {
  itemNames: Array<string>
  itemPrices: Record<string, Array<number>>
}

export const getOrderSuggestions = createServerFn({ method: 'GET' })
  .validator(z.object({ eventId: z.uuid() }))
  .handler(async ({ data }): Promise<OrderSuggestions> => {
    const user = await getSessionUser()
    if (!user) throw new Error('Belum login')

    // Saran diambil dari barang di SEMUA pesanan pada event ini (punya user).
    const rows = await db
      .select({ name: items.name, originalPrice: items.originalPrice })
      .from(items)
      .innerJoin(orders, eq(items.orderId, orders.id))
      .innerJoin(events, eq(orders.eventId, events.id))
      .where(
        and(eq(events.id, data.eventId), eq(events.brandId, brandIdOf(user))),
      )

    const itemNames = Array.from(
      new Set(rows.map((row) => row.name.trim()).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b))

    const itemPrices: Record<string, Array<number>> = {}
    for (const row of rows) {
      const name = row.name.trim()
      const price = Number(row.originalPrice)
      if (!name || !Number.isFinite(price)) continue
      const list = itemPrices[name] ?? []
      if (!list.includes(price)) list.push(price)
      itemPrices[name] = list
    }
    for (const name in itemPrices) {
      itemPrices[name].sort((a, b) => a - b)
    }

    return { itemNames, itemPrices }
  })

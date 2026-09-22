import { createServerFn } from '@tanstack/react-start'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db'
import { events, items, orders } from '../db/schema'
import { getSessionUser } from './auth'
import { getUserEntitlements } from './entitlements'
import { canUseFeature } from './subscription'

/**
 * Saran nama barang & harga asli untuk form Tambah/Edit Pesanan (dulu dihitung
 * di komponen `events.$eventId.tsx`, sekarang lewat server supaya gate fitur
 * PRO-nya benar-benar berlaku di API).
 *
 * Keputusan bentuk respons: endpoint ini TIDAK melempar error waktu fiturnya
 * terkunci, tapi mengembalikan `unlocked: false` + data kosong — supaya halaman
 * event tetap bisa dirender normal dan tinggal menampilkan status terkunci.
 * Yang penting: server tidak pernah mengirim data saran ke user FREE.
 */
export interface OrderSuggestions {
  unlocked: boolean
  itemNames: Array<string>
  itemPrices: Record<string, Array<number>>
}

const LOCKED_SUGGESTIONS: OrderSuggestions = {
  unlocked: false,
  itemNames: [],
  itemPrices: {},
}

export const getOrderSuggestions = createServerFn({ method: 'GET' })
  .validator(z.object({ eventId: z.uuid() }))
  .handler(async ({ data }): Promise<OrderSuggestions> => {
    const user = await getSessionUser()
    if (!user) throw new Error('Belum login')

    const entitlements = await getUserEntitlements(user)
    if (!canUseFeature(entitlements, 'order_suggestions')) {
      return LOCKED_SUGGESTIONS
    }

    // Saran diambil dari barang di SEMUA pesanan pada event ini (punya user).
    const rows = await db
      .select({ name: items.name, originalPrice: items.originalPrice })
      .from(items)
      .innerJoin(orders, eq(items.orderId, orders.id))
      .innerJoin(events, eq(orders.eventId, events.id))
      .where(and(eq(events.id, data.eventId), eq(events.userId, user.id)))

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

    return { unlocked: true, itemNames, itemPrices }
  })

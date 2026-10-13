import { createServerFn } from '@tanstack/react-start'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db'
import { events, items, orders } from '../db/schema'
import { brandIdOf } from './brand'
import { getSessionUser } from './auth'
import { buildFeeSuggestions } from './fee-suggestions'
import type { FeeSuggestion } from './fee-suggestions'

/**
 * Saran tier aturan fee dari histori barang user.
 *
 * Fitur ini TERBUKA untuk semua paket (termasuk FREE) — jadi tidak ada
 * pengecekan entitlement di sini.
 */
export interface FeeSuggestionsResult {
  suggestions: Array<FeeSuggestion>
}

export const getFeeSuggestions = createServerFn({ method: 'GET' })
  .validator(z.object({ eventId: z.uuid().optional() }).optional())
  .handler(async ({ data }): Promise<FeeSuggestionsResult> => {
    const user = await getSessionUser()
    if (!user) throw new Error('Belum login')

    const rows = await db
      .select({ originalPrice: items.originalPrice, fee: items.fee })
      .from(items)
      .innerJoin(orders, eq(items.orderId, orders.id))
      .innerJoin(events, eq(orders.eventId, events.id))
      .where(
        data?.eventId
          ? and(
              eq(events.brandId, brandIdOf(user)),
              eq(events.id, data.eventId),
            )
          : eq(events.brandId, brandIdOf(user)),
      )

    return {
      suggestions: buildFeeSuggestions(
        rows.map((row) => ({
          originalPrice: Number(row.originalPrice),
          fee: Number(row.fee),
        })),
      ),
    }
  })

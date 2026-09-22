import { createServerFn } from '@tanstack/react-start'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db'
import { events, items, orders } from '../db/schema'
import { getSessionUser } from './auth'
import { getUserEntitlements } from './entitlements'
import { buildFeeSuggestions } from './fee-suggestions'
import { canUseFeature } from './subscription'
import type { FeeSuggestion } from './fee-suggestions'

/**
 * Saran tier aturan fee dari histori barang user (fitur PRO `fee_suggestions`).
 *
 * Sama seperti `getOrderSuggestions`: waktu fiturnya terkunci, endpoint ini
 * balas `unlocked: false` + daftar kosong (bukan error), supaya halaman
 * Manajemen Fee tetap tampil normal tanpa data saran.
 */
export interface FeeSuggestionsResult {
  unlocked: boolean
  suggestions: Array<FeeSuggestion>
}

export const getFeeSuggestions = createServerFn({ method: 'GET' })
  .validator(z.object({ eventId: z.uuid().optional() }).optional())
  .handler(async ({ data }): Promise<FeeSuggestionsResult> => {
    const user = await getSessionUser()
    if (!user) throw new Error('Belum login')

    const entitlements = await getUserEntitlements(user)
    if (!canUseFeature(entitlements, 'fee_suggestions')) {
      return { unlocked: false, suggestions: [] }
    }

    const rows = await db
      .select({ originalPrice: items.originalPrice, fee: items.fee })
      .from(items)
      .innerJoin(orders, eq(items.orderId, orders.id))
      .innerJoin(events, eq(orders.eventId, events.id))
      .where(
        data?.eventId
          ? and(eq(events.userId, user.id), eq(events.id, data.eventId))
          : eq(events.userId, user.id),
      )

    return {
      unlocked: true,
      suggestions: buildFeeSuggestions(
        rows.map((row) => ({
          originalPrice: Number(row.originalPrice),
          fee: Number(row.fee),
        })),
      ),
    }
  })

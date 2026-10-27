import { and, asc, eq, inArray, notInArray } from 'drizzle-orm'
import { db } from '../db'
import {
  calendarEvents,
  partnerEventProducts,
  partnerProducts,
} from '../db/schema'
import { MAX_EVENT_PRODUCTS } from './partner-event-product-rules'
import { toRow } from './partner-product-queries'
import type { PartnerProductRow } from './partner-product-queries'

/**
 * Produk yang dibawa partner di satu event. Server-only. Kepemilikan event DAN
 * produk selalu dicek terhadap `partnerId` dari sesi: partner hanya bisa
 * memasang produknya sendiri ke event miliknya sendiri.
 */

/** Produk yang sudah dipilih untuk event ini (urut nama). */
export async function listPartnerEventProducts(
  partnerId: string,
  calendarEventId: string,
): Promise<Array<PartnerProductRow>> {
  const rows = await db
    .select({ product: partnerProducts })
    .from(partnerEventProducts)
    .innerJoin(
      partnerProducts,
      eq(partnerEventProducts.productId, partnerProducts.id),
    )
    .innerJoin(
      calendarEvents,
      eq(partnerEventProducts.calendarEventId, calendarEvents.id),
    )
    .where(
      and(
        eq(partnerEventProducts.calendarEventId, calendarEventId),
        eq(calendarEvents.partnerId, partnerId),
        eq(partnerProducts.partnerId, partnerId),
      ),
    )
    .orderBy(asc(partnerProducts.name))
  return rows.map((row) => toRow(row.product))
}

export class EventProductSelectionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EventProductSelectionError'
  }
}

/**
 * Ganti seluruh pilihan produk event menjadi `productIds` (daftar kosong =
 * tidak membawa produk apa pun). Atomik: event dikunci selama penggantian, jadi
 * dua simpan bersamaan tidak saling menimpa setengah-setengah.
 */
export async function replacePartnerEventProducts(
  partnerId: string,
  calendarEventId: string,
  productIds: ReadonlyArray<string>,
): Promise<void> {
  const ids = Array.from(new Set(productIds))
  if (ids.length > MAX_EVENT_PRODUCTS) {
    throw new EventProductSelectionError(
      `Maksimal ${MAX_EVENT_PRODUCTS} produk unggulan per event`,
    )
  }
  await db.transaction(async (tx) => {
    const found = await tx
      .select({ id: calendarEvents.id })
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.id, calendarEventId),
          eq(calendarEvents.partnerId, partnerId),
        ),
      )
      .for('update')
    if (found.length === 0) {
      throw new EventProductSelectionError('Event tidak ditemukan')
    }

    if (ids.length > 0) {
      const owned = await tx
        .select({ id: partnerProducts.id })
        .from(partnerProducts)
        .where(
          and(
            eq(partnerProducts.partnerId, partnerId),
            inArray(partnerProducts.id, ids),
          ),
        )
      if (owned.length !== ids.length) {
        throw new EventProductSelectionError('Ada produk yang tidak ditemukan')
      }
    }

    await tx
      .delete(partnerEventProducts)
      .where(
        ids.length === 0
          ? eq(partnerEventProducts.calendarEventId, calendarEventId)
          : and(
              eq(partnerEventProducts.calendarEventId, calendarEventId),
              notInArray(partnerEventProducts.productId, ids),
            ),
      )
    if (ids.length > 0) {
      await tx
        .insert(partnerEventProducts)
        .values(ids.map((productId) => ({ calendarEventId, productId })))
        .onConflictDoNothing()
    }
  })
}

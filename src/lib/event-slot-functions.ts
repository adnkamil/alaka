import { createServerFn } from '@tanstack/react-start'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getSessionUser } from './auth'
import { brandIdOf } from './brand'
import { checkCanSubmit } from './event-slot'
import type { OrderTx } from './order-status-queries'

/**
 * Server function alur slot sisi jastiper: submit pesanan ke partner, ringkasan
 * status/urutan, dan keputusan sanggah per paket. Query-nya ada di
 * `event-slot-queries.ts`. Isi handler memakai import dinamis supaya `db` tidak
 * ikut ke bundle client.
 */

async function requireUser() {
  const user = await getSessionUser()
  if (!user) throw new Error('Belum login')
  return user
}

const eventIdSchema = z.object({ eventId: z.uuid() })

/** Status alur slot satu event + urutan submit. Null = event tidak memakai alur slot. */
export const getEventSlotSummary = createServerFn({ method: 'GET' })
  .validator(eventIdSchema)
  .handler(async ({ data }) => {
    const { db } = await import('../db')
    const { events } = await import('../db/schema')
    const { getSlotSummary, resolveExpiredSanggah } =
      await import('./event-slot-queries')
    const user = await requireUser()
    return db.transaction(async (tx) => {
      const owned = await tx.query.events.findFirst({
        where: and(
          eq(events.id, data.eventId),
          eq(events.brandId, brandIdOf(user)),
        ),
      })
      if (!owned) throw new Error('Event tidak ditemukan')
      const now = new Date()
      // Batas sanggah yang lewat diselesaikan saat halaman dibuka.
      await resolveExpiredSanggah(tx, owned.id, now)
      const event = await tx.query.events.findFirst({
        where: eq(events.id, owned.id),
      })
      return getSlotSummary(tx, event ?? owned, now)
    })
  })

/**
 * Kirim semua pesanan event ke partner. Waktu submit dicatat dari jam server
 * dan menentukan urutan antrean. Setelah ini pesanan terkunci.
 */
export const submitEventToPartner = createServerFn({ method: 'POST' })
  .validator(eventIdSchema)
  .handler(async ({ data }) => {
    const { db } = await import('../db')
    const { events } = await import('../db/schema')
    const { countSubmittableItems, getSlotSummary, loadSlotConfig } =
      await import('./event-slot-queries')
    const user = await requireUser()
    return db.transaction(async (tx) => {
      // Kunci baris event supaya dobel klik tidak menghasilkan dua submit.
      const event = await tx
        .select()
        .from(events)
        .where(
          and(eq(events.id, data.eventId), eq(events.brandId, brandIdOf(user))),
        )
        .for('update')
        .then((rows) => rows.at(0))
      if (!event) throw new Error('Event tidak ditemukan')

      const now = new Date()
      const check = checkCanSubmit({
        config: await loadSlotConfig(tx, event.calendarEventId),
        submittedAt: event.submittedAt,
        itemCount: await countSubmittableItems(tx, event.id),
        now,
      })
      if (!check.ok) throw new Error(check.reason)

      const [updated] = await tx
        .update(events)
        .set({ submittedAt: sql`now()` })
        .where(eq(events.id, event.id))
        .returning()
      return getSlotSummary(tx, updated, now)
    })
  })

/** Muat paket milik brand ini yang sudah dicek partner (fase sanggah). */
async function loadOwnedReviewedBundle(
  tx: OrderTx,
  bundleId: string,
  brandId: string,
) {
  const { items } = await import('../db/schema')
  const bundle = await tx.query.items.findFirst({
    where: eq(items.id, bundleId),
    with: { order: { with: { event: true } } },
  })
  if (!bundle || bundle.order.event.brandId !== brandId) {
    throw new Error('Barang tidak ditemukan')
  }
  if (!bundle.isBundle) throw new Error('Barang ini bukan paket')
  const event = bundle.order.event
  if (event.reviewedAt === null) {
    throw new Error('Partner belum selesai mengecek pesanan ini.')
  }
  return { bundle, event }
}

/** "Tidak ganti": sisa paket kembali ke satuan (hanya pcs yang dapat). */
export const keepBundleAfterReview = createServerFn({ method: 'POST' })
  .validator(z.object({ bundleId: z.uuid() }))
  .handler(async ({ data }) => {
    const { db } = await import('../db')
    const { events } = await import('../db/schema')
    const { keepBundleWithoutReplacement } =
      await import('./event-slot-queries')
    const user = await requireUser()
    return db.transaction(async (tx) => {
      const { event } = await loadOwnedReviewedBundle(
        tx,
        data.bundleId,
        brandIdOf(user),
      )
      const result = await keepBundleWithoutReplacement(tx, data.bundleId)
      await tx
        .update(events)
        .set({ decidedAt: new Date() })
        .where(eq(events.id, event.id))
      return result
    })
  })

/** "Ganti": komponen bermasalah diganti varian lain; menunggu verifikasi partner. */
export const replaceBundleComponentAfterReview = createServerFn({
  method: 'POST',
})
  .validator(z.object({ componentId: z.uuid(), partnerVariantId: z.uuid() }))
  .handler(async ({ data }) => {
    const { db } = await import('../db')
    const { itemComponents } = await import('../db/schema')
    const { replaceBundleComponent } = await import('./event-slot-queries')
    const user = await requireUser()
    return db.transaction(async (tx) => {
      const component = await tx.query.itemComponents.findFirst({
        where: eq(itemComponents.id, data.componentId),
      })
      if (!component) throw new Error('Barang tidak ditemukan')
      const { event } = await loadOwnedReviewedBundle(
        tx,
        component.itemId,
        brandIdOf(user),
      )
      if (!event.calendarEventId) {
        throw new Error('Event ini tidak terhubung ke event partner.')
      }
      return replaceBundleComponent(tx, {
        componentId: data.componentId,
        variantId: data.partnerVariantId,
        calendarEventId: event.calendarEventId,
      })
    })
  })

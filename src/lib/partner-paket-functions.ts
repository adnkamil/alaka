import { createServerFn } from '@tanstack/react-start'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  events,
  itemComponents,
  items,
  orders,
  partnerRuleProducts,
  partnerRuleSizes,
  partnerVariants,
} from '../db/schema'
import { getSessionUser } from './auth'
import { brandIdOf } from './brand'
import { assertOrdersEditable } from './event-slot'
import { findMergeTarget } from './order-merge'
import { recalculateOrderStatus } from './order-status-queries'
import {
  dissolveBundle,
  findRuleForVariant,
  isProductInEvent,
  loadVariantInfo,
  regroupRuleInOrder,
  variantItemName,
} from './partner-paket-queries'
import { partnerItemName, variantLabel } from './partner-item-label'

async function requireUser() {
  const user = await getSessionUser()
  if (!user) throw new Error('Belum login')
  return user
}

const addPartnerItemSchema = z.object({
  eventId: z.uuid(),
  customerName: z.string().min(1, 'Nama pelanggan wajib diisi'),
  partnerVariantId: z.uuid(),
  /** Harga jual per unit. Default diisi klien dari harga varian. */
  originalPrice: z.number().nonnegative(),
  fee: z.number().nonnegative(),
  qty: z.number().int().min(1, 'Jumlah minimal 1').default(1),
})

/**
 * Menambahkan barang satuan dari katalog partner ke pesanan pelanggan, lalu
 * menjalankan FIFO untuk aturan paket produk itu (kalau ada). HPP diambil dari
 * database, bukan dari klien.
 */
export const addPartnerItem = createServerFn({ method: 'POST' })
  .validator(addPartnerItemSchema)
  .handler(async ({ data }) => {
    const { db } = await import('../db')
    const user = await requireUser()
    const brandId = brandIdOf(user)

    return db.transaction(async (tx) => {
      const event = await tx.query.events.findFirst({
        where: and(eq(events.id, data.eventId), eq(events.brandId, brandId)),
      })
      if (!event) throw new Error('Event tidak ditemukan')
      assertOrdersEditable(event)
      if (!event.isActive) {
        throw new Error('Event ini nonaktif, jadi tidak bisa menambah pesanan.')
      }
      if (!event.calendarEventId) {
        throw new Error(
          'Event ini tidak terhubung ke event partner, jadi katalog tidak bisa dipakai.',
        )
      }

      const info = (await loadVariantInfo(tx, [data.partnerVariantId])).get(
        data.partnerVariantId,
      )
      const [variant] = await tx
        .select({ isActive: partnerVariants.isActive })
        .from(partnerVariants)
        .where(eq(partnerVariants.id, data.partnerVariantId))
      if (!info || !variant?.isActive) {
        throw new Error('Varian tidak ditemukan atau nonaktif.')
      }
      if (!(await isProductInEvent(tx, event.calendarEventId, info.productId))) {
        throw new Error(`${info.productName} tidak dijual di event ini.`)
      }

      const eventOrders = await tx.query.orders.findMany({
        where: eq(orders.eventId, event.id),
      })
      const target = findMergeTarget(eventOrders, data.customerName)
      let orderId: string
      if (target) {
        orderId = target.id
      } else {
        const [created] = await tx
          .insert(orders)
          .values({
            eventId: event.id,
            customerName: data.customerName,
            paymentStatus: 'unpaid',
            paidAmount: '0',
          })
          .returning({ id: orders.id })
        orderId = created.id
      }

      // Barang yang sama dengan harga dan fee yang sama digabung ke satu baris.
      const sameSingles = await tx
        .select()
        .from(items)
        .where(
          and(
            eq(items.orderId, orderId),
            eq(items.isBundle, false),
            eq(items.partnerVariantId, data.partnerVariantId),
          ),
        )
      const match = sameSingles.find(
        (row) =>
          Number(row.originalPrice) === data.originalPrice && Number(row.fee) === data.fee,
      )
      if (match) {
        await tx
          .update(items)
          .set({ qty: match.qty + data.qty })
          .where(eq(items.id, match.id))
      } else {
        await tx.insert(items).values({
          orderId,
          name: variantItemName(info),
          originalPrice: data.originalPrice.toString(),
          fee: data.fee.toString(),
          qty: data.qty,
          obtained: false,
          isBundle: false,
          partnerVariantId: data.partnerVariantId,
          hpp: info.price.toString(),
        })
      }

      const rule = await findRuleForVariant(tx, info.productId, info.size)
      if (rule) await regroupRuleInOrder(tx, orderId, rule.id)

      await recalculateOrderStatus(tx, orderId)
      return { orderId }
    })
  })

const componentIdSchema = z.object({ componentId: z.uuid() })

/** Ambil komponen beserta paketnya, dan pastikan milik brand yang login. */
async function loadOwnedComponent(
  tx: Parameters<Parameters<typeof import('../db')['db']['transaction']>[0]>[0],
  componentId: string,
  brandId: string,
) {
  const component = await tx.query.itemComponents.findFirst({
    where: eq(itemComponents.id, componentId),
  })
  if (!component) throw new Error('Barang tidak ditemukan')
  const bundle = await tx.query.items.findFirst({
    where: eq(items.id, component.itemId),
    with: { order: { with: { event: true } } },
  })
  if (!bundle || bundle.order.event.brandId !== brandId) {
    throw new Error('Barang tidak ditemukan')
  }
  if (!bundle.isBundle) throw new Error('Barang ini bukan paket')
  // Setelah submit, isi paket hanya berubah lewat jalur sanggah.
  assertOrdersEditable(bundle.order.event)
  return { component, bundle }
}

/**
 * Menghapus satu barang dari paket. Barang itu hilang dari pesanan. Sisa paket
 * kembali ke barang satuan, lalu FIFO dijalankan lagi untuk aturan yang sama.
 */
export const removeBundleComponent = createServerFn({ method: 'POST' })
  .validator(componentIdSchema)
  .handler(async ({ data }) => {
    const { db } = await import('../db')
    const user = await requireUser()
    const brandId = brandIdOf(user)

    return db.transaction(async (tx) => {
      const { component, bundle } = await loadOwnedComponent(
        tx,
        data.componentId,
        brandId,
      )

      await tx
        .delete(itemComponents)
        .where(eq(itemComponents.id, component.id))
      await dissolveBundle(tx, bundle.id)
      if (bundle.partnerRuleId) {
        await regroupRuleInOrder(tx, bundle.orderId, bundle.partnerRuleId)
      }

      await recalculateOrderStatus(tx, bundle.orderId)
      return { orderId: bundle.orderId }
    })
  })

const updateComponentSchema = z.object({
  componentId: z.uuid(),
  partnerVariantId: z.uuid(),
})

/**
 * Mengganti varian satu komponen paket. Hanya produk dengan aturan paket yang
 * sama yang boleh dipilih, sehingga jumlah pcs dan pembentukan paket tidak berubah.
 */
export const updateBundleComponent = createServerFn({ method: 'POST' })
  .validator(updateComponentSchema)
  .handler(async ({ data }) => {
    const { db } = await import('../db')
    const user = await requireUser()
    const brandId = brandIdOf(user)

    return db.transaction(async (tx) => {
      const { component, bundle } = await loadOwnedComponent(
        tx,
        data.componentId,
        brandId,
      )
      if (!bundle.partnerRuleId) {
        throw new Error('Aturan paket ini sudah tidak aktif, jadi isinya tidak bisa diubah.')
      }

      const ruleProductRows = await tx
        .select({ productId: partnerRuleProducts.partnerProductId })
        .from(partnerRuleProducts)
        .where(eq(partnerRuleProducts.ruleId, bundle.partnerRuleId))
      const ruleProductIds = new Set(ruleProductRows.map((r) => r.productId))
      const ruleSizeRows = await tx
        .select({ name: partnerRuleSizes.sizeName })
        .from(partnerRuleSizes)
        .where(eq(partnerRuleSizes.ruleId, bundle.partnerRuleId))
      const ruleSizes = new Set(ruleSizeRows.map((z) => z.name))

      const info = (await loadVariantInfo(tx, [data.partnerVariantId])).get(
        data.partnerVariantId,
      )
      const [variant] = await tx
        .select({ isActive: partnerVariants.isActive })
        .from(partnerVariants)
        .where(eq(partnerVariants.id, data.partnerVariantId))
      if (!info || !variant?.isActive) {
        throw new Error('Varian tidak ditemukan atau nonaktif.')
      }
      if (!ruleProductIds.has(info.productId)) {
        throw new Error('Produk ini tidak masuk aturan paket.')
      }
      if (
        ruleSizes.size > 0 &&
        (info.size === null || !ruleSizes.has(info.size))
      ) {
        throw new Error('Ukuran ini tidak masuk rentang aturan paket.')
      }

      await tx
        .update(itemComponents)
        .set({
          partnerVariantId: data.partnerVariantId,
          productName: info.productName,
          size: info.size,
          variation: info.variation,
        })
        .where(eq(itemComponents.id, component.id))

      // Nama gabungan paket ikut diperbarui dari komponen terbaru.
      const comps = await tx
        .select()
        .from(itemComponents)
        .where(eq(itemComponents.itemId, bundle.id))
      const name = comps
        .map((c) =>
          partnerItemName(c.productName, variantLabel({ size: c.size, variation: c.variation })),
        )
        .join(' + ')
      await tx.update(items).set({ name }).where(eq(items.id, bundle.id))

      return { orderId: bundle.orderId }
    })
  })

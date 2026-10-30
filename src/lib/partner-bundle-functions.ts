import { createServerFn } from '@tanstack/react-start'
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db'
import {
  events,
  itemComponents,
  items,
  orders,
  partnerEventProducts,
  partnerOptionGroups,
  partnerOptionValues,
  partnerPricingRules,
  partnerProducts,
  partnerRuleProducts,
  partnerSubscriptions,
  partnerVariantValues,
  partnerVariants,
} from '../db/schema'
import { getSessionUser } from './auth'
import { brandIdOf } from './brand'
import { findMergeTarget } from './order-merge'
import { derivePaymentStatus } from './order-totals'
import {
  PricingError,
  buildBundleLine,
  type BundleComponent,
  type PricingRule,
} from './partner-pricing'
import { hasPartnerPro } from './partner-entitlement'
import { lineTotal } from './partner-bundle-lock'

async function requireUser() {
  const user = await getSessionUser()
  if (!user) throw new Error('Belum login')
  return user
}

const addPartnerBundleSchema = z.object({
  eventId: z.uuid(),
  customerName: z.string().min(1, 'Nama pelanggan wajib diisi'),
  ruleId: z.uuid(),
  components: z
    .array(
      z.object({
        partnerVariantId: z.uuid(),
        qty: z.number().int().min(1),
      }),
    )
    .min(1, 'Paket harus berisi barang'),
  sellPrice: z.number().nonnegative(),
  fee: z.number().nonnegative(),
  bundleCount: z.number().int().min(1).default(1),
})

/**
 * Menambahkan satu bundle dari aturan paket partner ke pesanan pelanggan di
 * event jastiper. Semua nilai HPP dan validasi diambil dari database, bukan
 * dari input klien. Bundle ditambahkan sebagai baris baru; baris lain di
 * pesanan tidak diubah.
 */
export const addPartnerBundle = createServerFn({ method: 'POST' })
  .validator(addPartnerBundleSchema)
  .handler(async ({ data }) => {
    const user = await requireUser()
    const brandId = brandIdOf(user)

    return db.transaction(async (tx) => {
      const event = await tx.query.events.findFirst({
        where: and(eq(events.id, data.eventId), eq(events.brandId, brandId)),
      })
      if (!event) throw new Error('Event tidak ditemukan')
      if (!event.isActive) {
        throw new Error('Event ini nonaktif, jadi tidak bisa menambah pesanan.')
      }
      if (!event.calendarEventId) {
        throw new Error(
          'Event ini tidak terhubung ke event partner, jadi paket tidak bisa dipakai.',
        )
      }

      const rule = await tx.query.partnerPricingRules.findFirst({
        where: eq(partnerPricingRules.id, data.ruleId),
      })
      if (!rule || !rule.isActive) {
        throw new Error('Aturan paket tidak ditemukan atau nonaktif.')
      }

      // Partner harus PRO untuk membuat bundle baru. Bundle yang sudah ada
      // tetap bisa dilihat dan diubah harganya walaupun langganan sudah habis.
      const subs = await tx
        .select({
          status: partnerSubscriptions.status,
          startedAt: partnerSubscriptions.startedAt,
          endsAt: partnerSubscriptions.endsAt,
        })
        .from(partnerSubscriptions)
        .where(eq(partnerSubscriptions.partnerId, rule.partnerId))
      if (!hasPartnerPro(subs)) {
        throw new Error('Fitur paket belum aktif untuk partner ini.')
      }

      const ruleProductRows = await tx
        .select({ productId: partnerRuleProducts.partnerProductId })
        .from(partnerRuleProducts)
        .where(eq(partnerRuleProducts.ruleId, rule.id))
      const ruleProductIds = new Set(ruleProductRows.map((r) => r.productId))

      // Produk yang dibeli harus memang dijual di event partner ini.
      const eventProductRows = await tx
        .select({ productId: partnerEventProducts.productId })
        .from(partnerEventProducts)
        .where(eq(partnerEventProducts.calendarEventId, event.calendarEventId))
      const eventProductIds = new Set(eventProductRows.map((r) => r.productId))

      const variantIds = data.components.map((c) => c.partnerVariantId)
      const variantRows = await tx
        .select({
          id: partnerVariants.id,
          productId: partnerVariants.partnerProductId,
          isActive: partnerVariants.isActive,
          productName: partnerProducts.name,
        })
        .from(partnerVariants)
        .innerJoin(
          partnerProducts,
          eq(partnerProducts.id, partnerVariants.partnerProductId),
        )
        .where(inArray(partnerVariants.id, variantIds))
      const variantById = new Map(variantRows.map((v) => [v.id, v]))

      const valueRows = await tx
        .select({
          variantId: partnerVariantValues.variantId,
          type: partnerOptionGroups.type,
          name: partnerOptionValues.name,
        })
        .from(partnerVariantValues)
        .innerJoin(
          partnerOptionValues,
          eq(partnerOptionValues.id, partnerVariantValues.optionValueId),
        )
        .innerJoin(
          partnerOptionGroups,
          eq(partnerOptionGroups.id, partnerOptionValues.optionGroupId),
        )
        .where(inArray(partnerVariantValues.variantId, variantIds))

      const components: Array<BundleComponent> = []
      for (const input of data.components) {
        const variant = variantById.get(input.partnerVariantId)
        if (!variant || !variant.isActive) {
          throw new Error('Varian tidak ditemukan atau nonaktif.')
        }
        if (!eventProductIds.has(variant.productId)) {
          throw new Error(`${variant.productName} tidak dijual di event ini.`)
        }
        const values = valueRows.filter((v) => v.variantId === variant.id)
        components.push({
          partnerProductId: variant.productId,
          partnerVariantId: variant.id,
          productName: variant.productName,
          size: values.find((v) => v.type === 'ukuran')?.name ?? null,
          variation: values.find((v) => v.type === 'variasi')?.name ?? null,
          qty: input.qty,
        })
      }

      const pricingRule: PricingRule = {
        id: rule.id,
        name: rule.name,
        minQty: rule.minQty,
        bundlePrice: Number(rule.bundlePrice),
        productIds: [...ruleProductIds],
      }

      let line
      try {
        line = buildBundleLine(pricingRule, components, {
          sellPrice: data.sellPrice,
          fee: data.fee,
          bundleCount: data.bundleCount,
        })
      } catch (error) {
        if (error instanceof PricingError) throw new Error(error.message)
        throw error
      }

      // Cari pesanan pelanggan yang masih bisa digabung, atau buat baru.
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

      const [item] = await tx
        .insert(items)
        .values({
          orderId,
          name: line.name,
          originalPrice: line.originalPrice.toString(),
          fee: line.fee.toString(),
          qty: line.qty,
          obtained: false,
          isBundle: true,
          partnerRuleId: rule.id,
          hpp: line.hpp.toString(),
        })
        .returning({ id: items.id })

      await tx.insert(itemComponents).values(
        line.components.map((c) => ({
          itemId: item.id,
          partnerVariantId: c.partnerVariantId,
          productName: c.productName,
          size: c.size,
          variation: c.variation,
          qty: c.qty,
        })),
      )

      await recalculateOrderStatus(tx, orderId)

      return { orderId, itemId: item.id, total: lineTotal({
        originalPrice: line.originalPrice,
        fee: line.fee,
        qty: line.qty,
      }) }
    })
  })

const updateBundlePricingSchema = z.object({
  itemId: z.uuid(),
  sellPrice: z.number().nonnegative(),
  fee: z.number().nonnegative(),
})

/**
 * Mengubah harga jual dan fee sebuah bundle partner. Isi, qty, dan HPP tidak
 * bisa diubah lewat aksi ini.
 */
export const updatePartnerBundlePricing = createServerFn({ method: 'POST' })
  .validator(updateBundlePricingSchema)
  .handler(async ({ data }) => {
    const user = await requireUser()
    const brandId = brandIdOf(user)

    return db.transaction(async (tx) => {
      const row = await tx.query.items.findFirst({
        where: eq(items.id, data.itemId),
        with: { order: { with: { event: true } } },
      })
      if (!row || row.order.event.brandId !== brandId) {
        throw new Error('Barang tidak ditemukan')
      }
      if (row.partnerRuleId === null) {
        throw new Error('Barang ini bukan bundle partner')
      }

      await tx
        .update(items)
        .set({
          originalPrice: data.sellPrice.toString(),
          fee: data.fee.toString(),
        })
        .where(eq(items.id, data.itemId))

      await recalculateOrderStatus(tx, row.orderId)
      return { orderId: row.orderId }
    })
  })

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** Hitung ulang total pesanan dan status pembayarannya dari semua barang. */
async function recalculateOrderStatus(tx: Tx, orderId: string) {
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

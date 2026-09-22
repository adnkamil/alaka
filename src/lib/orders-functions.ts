import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db'
import { customers, events, items, orders, paymentMethods } from '../db/schema'
import { getSessionUser } from './auth'
import {
  FeatureLockedError,
  getUserEntitlements,
  hasFullAccessAtForUser,
  requireFeature,
} from './entitlements'
import { canUseFeature } from './subscription'
import { derivePaymentStatus } from './order-totals'

async function requireUser() {
  const user = await getSessionUser()
  if (!user) throw new Error('Belum login')
  return user
}

async function assertEventOwnership(eventId: string, userId: string) {
  const event = await db.query.events.findFirst({
    where: and(eq(events.id, eventId), eq(events.userId, userId)),
  })
  if (!event) throw new Error('Event tidak ditemukan')
  return event
}

/**
 * Metode pembayaran aktif milik user (dari Profil → Pembayaran) yang ditampilkan
 * di halaman invoice/tagih. Hanya yang `is_active` yang ikut.
 */
async function listActivePaymentMethods(userId: string) {
  return (
    db
      .select({
        id: paymentMethods.id,
        type: paymentMethods.type,
        provider: paymentMethods.provider,
        accountNumber: paymentMethods.accountNumber,
        accountName: paymentMethods.accountName,
        qrisImage: paymentMethods.qrisImage,
      })
      .from(paymentMethods)
      .where(
        and(
          eq(paymentMethods.userId, userId),
          eq(paymentMethods.isActive, true),
        ),
      )
      // id sebagai tiebreaker supaya urutan stabil kalau created_at sama persis
      // (Postgres pakai waktu mulai transaksi, jadi bisa identik).
      .orderBy(asc(paymentMethods.createdAt), asc(paymentMethods.id))
  )
}

const itemInputSchema = z.object({
  name: z.string().min(1, 'Nama barang wajib diisi'),
  originalPrice: z.number().nonnegative(),
  // Fee berlaku per unit, jadi total baris = (originalPrice + fee) * qty.
  fee: z.number().nonnegative(),
  qty: z.number().int().min(1, 'Jumlah minimal 1').default(1),
  // Checklist belanja: dibawa terus dari form edit supaya status "sudah didapat"
  // tidak ke-reset waktu pesanan di-edit (updateOrder menghapus lalu insert ulang
  // semua baris item).
  obtained: z.boolean().default(false),
})

const createOrderSchema = z.object({
  eventId: z.uuid(),
  customerName: z.string().min(1, 'Nama pelanggan wajib diisi'),
  paymentStatus: z.enum(['unpaid', 'dp', 'paid', 'shipped']).default('unpaid'),
  /** Nominal DP (opsional). Kalau kosong, dihitung dari status pembayaran. */
  paidAmount: z.number().nonnegative().optional(),
  items: z.array(itemInputSchema).min(1, 'Minimal satu barang'),
})

export const createOrder = createServerFn({ method: 'POST' })
  .validator(createOrderSchema)
  .handler(async ({ data }) => {
    const user = await requireUser()
    await assertEventOwnership(data.eventId, user.id)

    const total = data.items.reduce(
      (sum, item) => sum + (item.originalPrice + item.fee) * item.qty,
      0,
    )
    const requestedPaid =
      data.paidAmount ?? (data.paymentStatus === 'unpaid' ? 0 : total)
    const paidAmount = Math.min(Math.max(requestedPaid, 0), total)
    const paymentStatus =
      data.paymentStatus === 'shipped'
        ? 'shipped'
        : derivePaymentStatus(paidAmount, total)

    const [order] = await db
      .insert(orders)
      .values({
        eventId: data.eventId,
        customerName: data.customerName,
        paymentStatus,
        paidAmount: paidAmount.toString(),
      })
      .returning()

    await db.insert(items).values(
      data.items.map((item) => ({
        orderId: order.id,
        name: item.name,
        originalPrice: item.originalPrice.toString(),
        fee: item.fee.toString(),
        qty: item.qty,
        obtained: item.obtained,
      })),
    )

    return order
  })

export const updateOrderPaymentStatus = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      orderId: z.uuid(),
      paymentStatus: z.enum(['unpaid', 'dp', 'paid', 'shipped']),
      /** Nominal dibayar — dipakai waktu status 'dp' (nominal DP). */
      paidAmount: z.number().nonnegative().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const user = await requireUser()

    const order = await db.query.orders.findFirst({
      where: eq(orders.id, data.orderId),
      with: { event: true, items: true },
    })
    if (!order || order.event.userId !== user.id) {
      throw new Error('Pesanan tidak ditemukan')
    }

    const total = order.items.reduce(
      (sum, item) =>
        sum + (Number(item.originalPrice) + Number(item.fee)) * item.qty,
      0,
    )

    // Nominal per status: unpaid -> 0, paid -> lunas penuh, dp -> nominal yang
    // dikirim, shipped -> penanda pengiriman (nominal tidak dipaksa lunas).
    const requestedPaid =
      data.paymentStatus === 'unpaid'
        ? 0
        : data.paymentStatus === 'paid'
          ? total
          : (data.paidAmount ?? Number(order.paidAmount))
    const paidAmount = Math.min(Math.max(requestedPaid, 0), total)
    const paymentStatus =
      data.paymentStatus === 'shipped'
        ? 'shipped'
        : derivePaymentStatus(paidAmount, total)

    await db
      .update(orders)
      .set({
        paymentStatus,
        paidAmount: paidAmount.toString(),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, data.orderId))
  })

const updateOrderSchema = z.object({
  orderId: z.uuid(),
  customerName: z.string().min(1, 'Nama pelanggan wajib diisi'),
  paymentStatus: z.enum(['unpaid', 'dp', 'paid', 'shipped']),
  paidAmount: z.number().nonnegative().optional(),
  items: z.array(itemInputSchema).min(1, 'Minimal satu barang'),
})

export const updateOrder = createServerFn({ method: 'POST' })
  .validator(updateOrderSchema)
  .handler(async ({ data }) => {
    const user = await requireUser()

    const order = await db.query.orders.findFirst({
      where: eq(orders.id, data.orderId),
      with: { event: true },
    })
    if (!order || order.event.userId !== user.id) {
      throw new Error('Pesanan tidak ditemukan')
    }

    // Total tagihan baru ikut barang yang baru, jadi nominal terbayar dirapikan:
    // kalau lunas -> penuh, kalau DP -> tidak boleh lebih dari total baru.
    const total = data.items.reduce(
      (sum, item) => sum + (item.originalPrice + item.fee) * item.qty,
      0,
    )
    const requestedPaid =
      data.paymentStatus === 'unpaid'
        ? 0
        : data.paymentStatus === 'paid'
          ? total
          : (data.paidAmount ?? Number(order.paidAmount))
    const paidAmount = Math.min(Math.max(requestedPaid, 0), total)
    const paymentStatus =
      data.paymentStatus === 'shipped'
        ? 'shipped'
        : derivePaymentStatus(paidAmount, total)

    await db
      .update(orders)
      .set({
        customerName: data.customerName,
        paymentStatus,
        paidAmount: paidAmount.toString(),
        updatedAt: new Date(),
      })
      .where(eq(orders.id, data.orderId))

    // Items aren't individually tracked by the form, so replace the full set.
    await db.delete(items).where(eq(items.orderId, data.orderId))
    await db.insert(items).values(
      data.items.map((item) => ({
        orderId: data.orderId,
        name: item.name,
        originalPrice: item.originalPrice.toString(),
        fee: item.fee.toString(),
        qty: item.qty,
        obtained: item.obtained,
      })),
    )
  })

/**
 * Tandai sekumpulan barang sebagai "sudah didapat" / "belum didapat".
 * Dipakai checklist belanja waktu live shopping: bisa satu baris barang,
 * atau sekaligus semua baris dengan nama barang yang sama (dari tab Per Item).
 */
export const updateItemsObtained = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      itemIds: z.array(z.uuid()).min(1, 'Minimal satu barang'),
      obtained: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    const user = await requireUser()

    // Pastikan semua item memang milik user ini (items -> orders -> events).
    const owned = await db
      .select({ id: items.id })
      .from(items)
      .innerJoin(orders, eq(items.orderId, orders.id))
      .innerJoin(events, eq(orders.eventId, events.id))
      .where(and(inArray(items.id, data.itemIds), eq(events.userId, user.id)))

    if (owned.length !== data.itemIds.length) {
      throw new Error('Barang tidak ditemukan')
    }

    await db
      .update(items)
      .set({ obtained: data.obtained })
      .where(inArray(items.id, data.itemIds))
  })

export const deleteOrder = createServerFn({ method: 'POST' })
  .validator(z.object({ orderId: z.uuid() }))
  .handler(async ({ data }) => {
    const user = await requireUser()

    const order = await db.query.orders.findFirst({
      where: eq(orders.id, data.orderId),
      with: { event: true },
    })
    if (!order || order.event.userId !== user.id) {
      throw new Error('Pesanan tidak ditemukan')
    }

    await db.delete(orders).where(eq(orders.id, data.orderId))
  })

export const deleteItem = createServerFn({ method: 'POST' })
  .validator(z.object({ itemId: z.uuid() }))
  .handler(async ({ data }) => {
    const user = await requireUser()

    const item = await db.query.items.findFirst({
      where: eq(items.id, data.itemId),
      with: { order: { with: { event: true } } },
    })
    if (!item || item.order.event.userId !== user.id) {
      throw new Error('Barang tidak ditemukan')
    }

    await db.delete(items).where(eq(items.id, data.itemId))
  })

// Data lengkap untuk halaman tagih/invoice: pastikan order milik event
// dan event milik user yang sedang login.
// Dipakai buat halaman invoice publik (dibuka customer lewat link WA,
// TANPA login). Sengaja nggak butuh session, tapi cuma ngasih data yang
// aman buat dilihat orang luar (nggak ada info user lain, nggak ada nomor
// HP pelanggan, dll).
export const getPublicOrderInvoice = createServerFn({ method: 'GET' })
  .validator(z.object({ eventId: z.uuid(), orderId: z.uuid() }))
  .handler(async ({ data }) => {
    const order = await db.query.orders.findFirst({
      where: eq(orders.id, data.orderId),
      with: { items: true, event: { with: { user: true } } },
    })
    if (!order || order.eventId !== data.eventId) {
      throw new Error('Invoice tidak ditemukan')
    }

    const owner = order.event.user

    // Gate fitur PRO `billing`. Aturan tambahan (grandfathering): pesanan yang
    // dibuat waktu akses user masih terbuka (trial/PRO) tetap bisa dibuka lewat
    // link publik — link itu sudah terlanjur dikirim ke pelanggan, jadi nggak
    // boleh mati mendadak waktu masa trial habis.
    const ownerEntitlements = await getUserEntitlements(owner)
    if (!canUseFeature(ownerEntitlements, 'billing')) {
      const entitledWhenCreated = await hasFullAccessAtForUser(
        owner,
        order.createdAt,
      )
      if (!entitledWhenCreated) throw new FeatureLockedError('billing')
    }

    return {
      order: {
        id: order.id,
        customerName: order.customerName,
        paymentStatus: order.paymentStatus,
        paidAmount: order.paidAmount,
        createdAt: order.createdAt,
      },
      event: {
        id: order.event.id,
        name: order.event.name,
        eventDate: order.event.eventDate,
      },
      items: order.items.map((item) => ({
        id: item.id,
        name: item.name,
        originalPrice: item.originalPrice,
        fee: item.fee,
        qty: item.qty,
      })),
      user: {
        name: owner.name,
        brandName: owner.brandName,
      },
      // Cuma metode pembayaran yang aktif — ini yang ditampilkan ke pelanggan.
      paymentMethods: await listActivePaymentMethods(owner.id),
    }
  })

export const getOrderInvoice = createServerFn({ method: 'GET' })
  .validator(z.object({ eventId: z.uuid(), orderId: z.uuid() }))
  .handler(async ({ data }) => {
    const user = await requireUser()

    const order = await db.query.orders.findFirst({
      where: eq(orders.id, data.orderId),
      with: { items: true, event: true },
    })
    if (!order || order.eventId !== data.eventId) {
      throw new Error('Pesanan tidak ditemukan')
    }
    if (order.event.userId !== user.id) {
      throw new Error('Pesanan tidak ditemukan')
    }

    // Fitur PRO `billing`: halaman tagih + kirim invoice ke pelanggan.
    requireFeature(await getUserEntitlements(user), 'billing')

    // Coba cari nomor HP dari data Customer yang tersimpan, cocokkan
    // "nama" atau "nama 4digitTerakhir" (format yang keisi dari suggestion
    // di AddOrderSheet) ke daftar Customer milik user ini.
    const savedCustomers = await db.query.customers.findMany({
      where: and(eq(customers.userId, user.id), isNull(customers.deletedAt)),
    })
    const matchedCustomer = savedCustomers.find(
      (c) =>
        order.customerName === c.name ||
        order.customerName.startsWith(`${c.name} `),
    )

    return {
      order: {
        id: order.id,
        customerName: order.customerName,
        customerPhone: matchedCustomer?.phone ?? order.customerPhone ?? null,
        customerRegistered: Boolean(matchedCustomer),
        paymentStatus: order.paymentStatus,
        paidAmount: order.paidAmount,
        createdAt: order.createdAt,
      },
      event: {
        id: order.event.id,
        name: order.event.name,
        eventDate: order.event.eventDate,
      },
      items: order.items.map((item) => ({
        id: item.id,
        name: item.name,
        originalPrice: item.originalPrice,
        fee: item.fee,
        qty: item.qty,
      })),
      user: {
        name: user.name,
        brandName: user.brandName,
        waMessageTemplate: user.waMessageTemplate,
      },
      // Cuma metode pembayaran yang aktif — ini yang ditampilkan ke pelanggan.
      paymentMethods: await listActivePaymentMethods(user.id),
    }
  })

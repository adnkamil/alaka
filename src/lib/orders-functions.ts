import { createServerFn } from '@tanstack/react-start'
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db'
import { customers, events, items, orders } from '../db/schema'
import { getSessionUser } from './auth'

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

const itemInputSchema = z.object({
  name: z.string().min(1, 'Nama barang wajib diisi'),
  originalPrice: z.number().nonnegative(),
  fee: z.number().nonnegative(),
})

const createOrderSchema = z.object({
  eventId: z.uuid(),
  customerName: z.string().min(1, 'Nama pelanggan wajib diisi'),
  paymentStatus: z.enum(['unpaid', 'paid', 'shipped']).default('unpaid'),
  items: z.array(itemInputSchema).min(1, 'Minimal satu barang'),
})

export const createOrder = createServerFn({ method: 'POST' })
  .validator(createOrderSchema)
  .handler(async ({ data }) => {
    const user = await requireUser()
    await assertEventOwnership(data.eventId, user.id)

    const [order] = await db
      .insert(orders)
      .values({
        eventId: data.eventId,
        customerName: data.customerName,
        paymentStatus: data.paymentStatus,
      })
      .returning()

    await db.insert(items).values(
      data.items.map((item) => ({
        orderId: order.id,
        name: item.name,
        originalPrice: item.originalPrice.toString(),
        fee: item.fee.toString(),
      })),
    )

    return order
  })

export const updateOrderPaymentStatus = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      orderId: z.uuid(),
      paymentStatus: z.enum(['unpaid', 'paid', 'shipped']),
    }),
  )
  .handler(async ({ data }) => {
    const user = await requireUser()

    const order = await db.query.orders.findFirst({
      where: eq(orders.id, data.orderId),
      with: { event: true },
    })
    if (!order || order.event.userId !== user.id) {
      throw new Error('Pesanan tidak ditemukan')
    }

    await db
      .update(orders)
      .set({ paymentStatus: data.paymentStatus, updatedAt: new Date() })
      .where(eq(orders.id, data.orderId))
  })

const updateOrderSchema = z.object({
  orderId: z.uuid(),
  customerName: z.string().min(1, 'Nama pelanggan wajib diisi'),
  paymentStatus: z.enum(['unpaid', 'paid', 'shipped']),
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

    await db
      .update(orders)
      .set({
        customerName: data.customerName,
        paymentStatus: data.paymentStatus,
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
      })),
    )
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

    return {
      order: {
        id: order.id,
        customerName: order.customerName,
        paymentStatus: order.paymentStatus,
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
      })),
      user: {
        name: owner.name,
        brandName: owner.brandName,
        bankName: owner.bankName,
        bankAccountNumber: owner.bankAccountNumber,
      },
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
      })),
      user: {
        name: user.name,
        brandName: user.brandName,
        bankName: user.bankName,
        bankAccountNumber: user.bankAccountNumber,
      },
    }
  })
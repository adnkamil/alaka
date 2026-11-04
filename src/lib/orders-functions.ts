import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db'
import {
  customers,
  events,
  items,
  itemComponents,
  orders,
  paymentMethods,
} from '../db/schema'
import { getSessionUser } from './auth'
import { applyBrandIdentity, brandIdOf } from './brand'
import { findBrand, findBrandOwner } from './brand-queries'
import {
  FeatureLockedError,
  getUserEntitlements,
  hasFullAccessAtForUser,
  requireFeature,
} from './entitlements'
import { canUseFeature } from './subscription'
import { EmailNotVerifiedError, isEmailVerified } from './email-verified'
import { findCustomerForOrder } from './customer-matching'
import { findMergeTarget, mergeItemLines, mergePaidAmount } from './order-merge'
import { resolveEventItems } from './partner-event-items'
import { derivePaymentStatus } from './order-totals'
import { buildPartnerBundle } from './partner-bundle-build'
import { lineTotal, partitionLockedItems } from './partner-bundle-lock'
import { carryCreatedAt } from './item-created-at'
import { regroupAllRulesInOrder } from './partner-paket-queries'
import type { BundleLine } from './partner-pricing'

async function requireUser() {
  const user = await getSessionUser()
  if (!user) throw new Error('Belum login')
  return user
}

async function assertEventOwnership(eventId: string, brandId: string) {
  const event = await db.query.events.findFirst({
    where: and(eq(events.id, eventId), eq(events.brandId, brandId)),
  })
  if (!event) throw new Error('Event tidak ditemukan')
  return event
}

/**
 * Metode pembayaran aktif milik user (dari Profil → Pembayaran) yang ditampilkan
 * di halaman invoice/tagih. Hanya yang `is_active` yang ikut.
 */
async function listActivePaymentMethods(brandId: string) {
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
          eq(paymentMethods.brandId, brandId),
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
  // Wajib di event partner (lihat resolveEventItems). Diabaikan di event lain.
  partnerVariantId: z.uuid().nullish(),
  originalPrice: z.number().nonnegative(),
  // Fee berlaku per unit, jadi total baris = (originalPrice + fee) * qty.
  fee: z.number().nonnegative(),
  qty: z.number().int().min(1, 'Jumlah minimal 1').default(1),
  // Checklist belanja: dibawa terus dari form edit supaya status "sudah didapat"
  // tidak ke-reset waktu pesanan di-edit (updateOrder menghapus lalu insert ulang
  // semua baris item).
  obtained: z.boolean().default(false),
})

/** Paket dari aturan partner. Divalidasi ulang di server lewat buildPartnerBundle. */
const bundleInputSchema = z.object({
  ruleId: z.uuid(),
  components: z
    .array(z.object({ partnerVariantId: z.uuid(), qty: z.number().int().min(1) }))
    .min(1, 'Paket harus berisi barang'),
  sellPrice: z.number().nonnegative(),
  fee: z.number().nonnegative(),
  bundleCount: z.number().int().min(1).default(1),
})

/** Menyimpan baris paket beserta isinya. Dipanggil setelah pesanan/barang disimpan. */
async function insertBundleLines(orderId: string, lines: Array<BundleLine>) {
  for (const line of lines) {
    const [row] = await db
      .insert(items)
      .values({
        orderId,
        name: line.name,
        originalPrice: line.originalPrice.toString(),
        fee: line.fee.toString(),
        qty: line.qty,
        obtained: false,
        isBundle: true,
        partnerRuleId: line.partnerRuleId,
        hpp: line.hpp.toString(),
      })
      .returning({ id: items.id })
    await db.insert(itemComponents).values(
      line.components.map((c) => ({
        itemId: row.id,
        partnerVariantId: c.partnerVariantId,
        productName: c.productName,
        size: c.size,
        variation: c.variation,
        qty: c.qty,
      })),
    )
  }
}

const createOrderSchema = z.object({
  eventId: z.uuid(),
  customerName: z.string().min(1, 'Nama pelanggan wajib diisi'),
  paymentStatus: z.enum(['unpaid', 'dp', 'paid', 'shipped']).default('unpaid'),
  /** Nominal DP (opsional). Kalau kosong, dihitung dari status pembayaran. */
  paidAmount: z.number().nonnegative().optional(),
  items: z.array(itemInputSchema).default([]),
  bundles: z.array(bundleInputSchema).default([]),
})

export const createOrder = createServerFn({ method: 'POST' })
  .validator(createOrderSchema)
  .handler(async ({ data }) => {
    const user = await requireUser()
    const event = await assertEventOwnership(data.eventId, brandIdOf(user))

    // Event nonaktif = sudah ditutup, jadi tidak boleh nambah pesanan baru.
    // Pesanan lama tetap bisa diedit/dihapus (lihat updateOrder/deleteOrder).
    if (!event.isActive) {
      throw new Error(
        'Event ini sedang nonaktif. Aktifkan dulu lewat menu ⋮ di halaman event untuk menambah pesanan baru.',
      )
    }

    if (data.items.length + data.bundles.length === 0) {
      throw new Error('Minimal satu barang atau paket')
    }

    // Di event partner, barang hanya boleh dari katalog partner. Nama dan HPP
    // diambil dari database, bukan dari klien.
    const eventItems = await resolveEventItems(event.calendarEventId, data.items)

    // Paket dicek ulang di server (aturan, PRO, produk di event, pcs) dan HPP-nya
    // diambil dari database, bukan dari klien.
    const brandId = brandIdOf(user)
    const bundleLines: Array<BundleLine> = []
    for (const bundle of data.bundles) {
      const { line } = await buildPartnerBundle(db, brandId, {
        ...bundle,
        eventId: data.eventId,
      })
      bundleLines.push(line)
    }
    const bundlesTotal = bundleLines.reduce(
      (sum, line) => sum + lineTotal(line),
      0,
    )

    const total =
      eventItems.reduce(
        (sum, item) => sum + (item.originalPrice + item.fee) * item.qty,
        0,
      ) + bundlesTotal
    const requestedPaid =
      data.paidAmount ?? (data.paymentStatus === 'unpaid' ? 0 : total)
    // Nominal yang dibayar untuk barang BARU ini saja (uang pesanan lama
    // dihitung terpisah waktu penggabungan).
    const paidForNewItems = Math.min(Math.max(requestedPaid, 0), total)

    // Satu pelanggan = satu tagihan per event: kalau pelanggan ini masih punya
    // pesanan yang belum lunas di event ini, barang barunya digabung ke situ —
    // aturannya di `order-merge.ts`. Pesanan yang sudah lunas/dikirim dibiarkan
    // terpisah, dan status `shipped` juga tidak digabung karena pengiriman
    // (dan barang yang sudah didapat) itu urusannya per pesanan.
    const mergeTarget =
      data.paymentStatus === 'shipped'
        ? undefined
        : findMergeTarget(
            await db.query.orders.findMany({
              where: eq(orders.eventId, data.eventId),
            }),
            data.customerName,
          )

    if (mergeTarget) {
      // Barang lama dibawa apa adanya (termasuk checklist "sudah didapat"),
      // baru digabung dengan barang yang baru diinput.
      const allExistingItems = await db.query.items.findMany({
        where: eq(items.orderId, mergeTarget.id),
      })
      // Baris bundle partner terkunci: tidak ikut digabung dan tidak dihapus.
      const { locked: lockedItems, editable: existingItems } =
        partitionLockedItems(allExistingItems)
      const mergedItems = mergeItemLines(
        existingItems.map((item) => ({
          name: item.name,
          originalPrice: Number(item.originalPrice),
          fee: Number(item.fee),
          qty: item.qty,
          obtained: item.obtained,
          partnerVariantId: item.partnerVariantId,
          hpp: item.hpp === null ? null : Number(item.hpp),
        })),
        eventItems,
      )
      const mergedTotal =
        mergedItems.reduce(
          (sum, item) => sum + (item.originalPrice + item.fee) * item.qty,
          0,
        ) +
        lockedItems.reduce((sum, row) => sum + lineTotal(row), 0) +
        bundlesTotal
      const mergedPaid = mergePaidAmount(
        mergeTarget.paidAmount,
        paidForNewItems,
        mergedTotal,
      )

      await db
        .update(orders)
        .set({
          paymentStatus: derivePaymentStatus(mergedPaid, mergedTotal),
          paidAmount: mergedPaid.toString(),
          updatedAt: new Date(),
        })
        .where(eq(orders.id, mergeTarget.id))

      // Sama seperti `updateOrder`: baris barang diganti seluruhnya supaya
      // qty hasil penggabungan ikut tersimpan di baris yang sudah ada.
      await db
        .delete(items)
        .where(
          and(eq(items.orderId, mergeTarget.id), eq(items.isBundle, false)),
        )
      if (mergedItems.length > 0) {
        await db.insert(items).values(
          carryCreatedAt(
            existingItems.map((p) => ({
              name: p.name,
              partnerVariantId: p.partnerVariantId,
              createdAt: p.createdAt,
            })),
            mergedItems,
          ).map((item) => ({
            createdAt: item.createdAt,
            orderId: mergeTarget.id,
            name: item.name,
            originalPrice: item.originalPrice.toString(),
            fee: item.fee.toString(),
            qty: item.qty,
            obtained: Boolean(item.obtained),
            partnerVariantId: item.partnerVariantId ?? null,
            hpp: item.hpp === null || item.hpp === undefined ? null : item.hpp.toString(),
          })),
        )
      }
      // Paket tidak pernah digabung ke barang lama: selalu baris baru.
      await insertBundleLines(mergeTarget.id, bundleLines)
      await db.transaction((tx) => regroupAllRulesInOrder(tx, mergeTarget.id))

      return {
        orderId: mergeTarget.id,
        customerName: mergeTarget.customerName,
        merged: true,
        total: mergedTotal,
      }
    }

    const paidAmount = paidForNewItems
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

    if (eventItems.length > 0) {
      await db.insert(items).values(
        eventItems.map((item) => ({
          orderId: order.id,
          name: item.name,
          originalPrice: item.originalPrice.toString(),
          fee: item.fee.toString(),
          qty: item.qty,
          obtained: item.obtained,
          partnerVariantId: item.partnerVariantId,
          hpp: item.hpp === null ? null : item.hpp.toString(),
        })),
      )
    }
    await insertBundleLines(order.id, bundleLines)
    await db.transaction((tx) => regroupAllRulesInOrder(tx, order.id))

    return {
      orderId: order.id,
      customerName: order.customerName,
      merged: false,
      total,
    }
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
    if (!order || order.event.brandId !== brandIdOf(user)) {
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
  items: z.array(itemInputSchema).default([]),
  /** Paket BARU yang ditambahkan. Paket lama yang sudah terkunci tidak dikirim ulang. */
  bundles: z.array(bundleInputSchema).default([]),
})

export const updateOrder = createServerFn({ method: 'POST' })
  .validator(updateOrderSchema)
  .handler(async ({ data }) => {
    const user = await requireUser()

    const order = await db.query.orders.findFirst({
      where: eq(orders.id, data.orderId),
      with: { event: true },
    })
    if (!order || order.event.brandId !== brandIdOf(user)) {
      throw new Error('Pesanan tidak ditemukan')
    }

    // Baris bundle partner terkunci: tidak diubah lewat form ini, tapi tetap
    // masuk ke total tagihan.
    const lockedItems = await db.query.items.findMany({
      where: and(eq(items.orderId, data.orderId), eq(items.isBundle, true)),
    })

    // Total tagihan baru ikut barang yang baru, jadi nominal terbayar dirapikan:
    // kalau lunas -> penuh, kalau DP -> tidak boleh lebih dari total baru.
    const brandId = brandIdOf(user)
    const bundleLines: Array<BundleLine> = []
    for (const bundle of data.bundles) {
      const { line } = await buildPartnerBundle(db, brandId, {
        ...bundle,
        eventId: order.eventId,
      })
      bundleLines.push(line)
    }
    const bundlesTotal = bundleLines.reduce(
      (sum, line) => sum + lineTotal(line),
      0,
    )

    const eventItems = await resolveEventItems(
      order.event.calendarEventId,
      data.items,
    )
    const total =
      eventItems.reduce(
        (sum, item) => sum + (item.originalPrice + item.fee) * item.qty,
        0,
      ) +
      lockedItems.reduce((sum, row) => sum + lineTotal(row), 0) +
      bundlesTotal
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

    // Barang satuan lama dicatat dulu supaya waktu masuknya (FIFO) tetap sama.
    const previousEditable = await db.query.items.findMany({
      where: and(eq(items.orderId, data.orderId), eq(items.isBundle, false)),
    })
    // Items aren't individually tracked by the form, so replace the full set.
    await db
      .delete(items)
      .where(and(eq(items.orderId, data.orderId), eq(items.isBundle, false)))
    if (eventItems.length > 0) {
      await db.insert(items).values(
        carryCreatedAt(previousEditable, eventItems).map((item) => ({
          createdAt: item.createdAt,
          orderId: data.orderId,
          name: item.name,
          originalPrice: item.originalPrice.toString(),
          fee: item.fee.toString(),
          qty: item.qty,
          obtained: item.obtained,
          partnerVariantId: item.partnerVariantId,
          hpp: item.hpp === null ? null : item.hpp.toString(),
        })),
      )
    }
    await insertBundleLines(data.orderId, bundleLines)
    await db.transaction((tx) => regroupAllRulesInOrder(tx, data.orderId))
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
      .where(
        and(
          inArray(items.id, data.itemIds),
          eq(events.brandId, brandIdOf(user)),
        ),
      )

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
    if (!order || order.event.brandId !== brandIdOf(user)) {
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
    if (!item || item.order.event.brandId !== brandIdOf(user)) {
      throw new Error('Barang tidak ditemukan')
    }

    await db.delete(items).where(eq(items.id, data.itemId))
  })

// Data lengkap untuk halaman tagih/invoice: pastikan order milik event
// dan event milik user yang sedang login.
// Dipakai buat halaman invoice publik (dibuka customer lewat link WA,
// TANPA login). Sengaja nggak butuh session, tapi cuma ngasih data yang
// aman buat dilihat orang luar (nggak ada info user lain, nggak ada nomor
// HP pelanggan, dll). Satu pengecualian: ALAMAT KIRIM pelanggan ikut dikirim
// (lihat di bawah) karena pelanggan perlu memastikan alamat pengirimannya
// sendiri sudah benar.
export const getPublicOrderInvoice = createServerFn({ method: 'GET' })
  .validator(z.object({ eventId: z.uuid(), orderId: z.uuid() }))
  .handler(async ({ data }) => {
    const order = await db.query.orders.findFirst({
      where: eq(orders.id, data.orderId),
      with: { items: { with: { components: true } }, event: true },
    })
    if (!order || order.eventId !== data.eventId) {
      throw new Error('Invoice tidak ditemukan')
    }

    // Identitas, verifikasi email, dan entitlement dibaca dari PEMILIK brand
    // event ini — bukan dari akun yang membuat event (bisa admin atau sudah
    // terhapus; `events.user_id` hanya "dibuat oleh").
    const [brand, ownerUser] = await Promise.all([
      findBrand(order.event.brandId),
      findBrandOwner(order.event.brandId),
    ])
    if (!brand || !ownerUser) throw new Error('Invoice tidak ditemukan')
    const owner = applyBrandIdentity(ownerUser, brand)

    // Link publik bisa dibuka siapa saja atas nama brand, jadi baru aktif
    // setelah email pemilik terverifikasi (cegah akun spam/phishing). Pesannya
    // ditulis untuk PELANGGAN, bukan pemilik akun.
    if (!isEmailVerified(owner)) {
      throw new EmailNotVerifiedError(
        'Tagihan ini belum bisa dibuka karena akun penjual belum menyelesaikan verifikasi email.',
      )
    }

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

    // Alamat kirim pelanggan. Order nggak punya FK ke tabel `customers`, jadi
    // dicocokkan lewat no. HP dengan aturan yang sama seperti halaman Invoice
    // internal (`customer-matching.ts`). Yang tampil cuma alamat milik pelanggan
    // order ini sendiri — bukan data pelanggan lain — senada dengan nama
    // pelanggan yang memang sudah tampil di invoice publik.
    const savedCustomers = await db.query.customers.findMany({
      where: and(
        eq(customers.brandId, brandIdOf(owner)),
        isNull(customers.deletedAt),
      ),
    })
    const matchedCustomer = findCustomerForOrder(
      savedCustomers,
      order.customerPhone,
    )

    return {
      order: {
        id: order.id,
        customerName: order.customerName,
        customerAddress: matchedCustomer?.address ?? null,
        paymentStatus: order.paymentStatus,
        paidAmount: order.paidAmount,
        createdAt: order.createdAt,
      },
      event: {
        id: order.event.id,
        name: order.event.name,
        eventDate: order.event.eventDate,
        // Kalau true, tagihan ini tidak memecah harga jadi "harga + fee".
        hideFee: order.event.hideFee,
      },
      items: order.items.map((item) => ({
        id: item.id,
        name: item.name,
        originalPrice: item.originalPrice,
        fee: item.fee,
        qty: item.qty,
        isBundle: item.isBundle,
        // Hanya nama dan varian komponen. Harga per komponen tidak dikirim.
        components: item.components.map((c) => ({
          id: c.id,
          productName: c.productName,
          size: c.size,
          variation: c.variation,
          qty: c.qty,
        })),
      })),
      user: {
        // `brandId` + `avatarUpdatedAt` dipakai buat URL foto brand
        // (`/api/avatar/:brandId?v=`). Id-nya UUID acak dan memang harus ada di
        // URL gambar publik itu; bukan kredensial (sesi pakai token terpisah).
        brandId: brandIdOf(owner),
        name: owner.name,
        brandName: owner.brandName,
        avatarUpdatedAt: owner.avatarUpdatedAt?.toISOString() ?? null,
      },
      // Cuma metode pembayaran yang aktif — ini yang ditampilkan ke pelanggan.
      paymentMethods: await listActivePaymentMethods(brandIdOf(owner)),
    }
  })

export const getOrderInvoice = createServerFn({ method: 'GET' })
  .validator(z.object({ eventId: z.uuid(), orderId: z.uuid() }))
  .handler(async ({ data }) => {
    const user = await requireUser()

    const order = await db.query.orders.findFirst({
      where: eq(orders.id, data.orderId),
      with: { items: { with: { components: true } }, event: true },
    })
    if (!order || order.eventId !== data.eventId) {
      throw new Error('Pesanan tidak ditemukan')
    }
    if (order.event.brandId !== brandIdOf(user)) {
      throw new Error('Pesanan tidak ditemukan')
    }

    // Fitur PRO `billing`: halaman tagih + kirim invoice ke pelanggan.
    requireFeature(await getUserEntitlements(user), 'billing')

    // Cari data Customer yang tersimpan (no. HP + alamat kirim) dengan
    // mencocokkan no. HP pesanan ke daftar Customer milik user ini. Aturannya
    // dipakai bareng dengan link tagihan publik, lihat `customer-matching.ts`.
    const savedCustomers = await db.query.customers.findMany({
      where: and(
        eq(customers.brandId, brandIdOf(user)),
        isNull(customers.deletedAt),
      ),
    })
    const matchedCustomer = findCustomerForOrder(
      savedCustomers,
      order.customerPhone,
    )

    return {
      order: {
        id: order.id,
        customerName: order.customerName,
        customerPhone: matchedCustomer?.phone ?? order.customerPhone ?? null,
        customerRegistered: Boolean(matchedCustomer),
        customerAddress: matchedCustomer?.address ?? null,
        paymentStatus: order.paymentStatus,
        paidAmount: order.paidAmount,
        createdAt: order.createdAt,
      },
      event: {
        id: order.event.id,
        name: order.event.name,
        eventDate: order.event.eventDate,
        // Kalau true, tagihan ini tidak memecah harga jadi "harga + fee".
        hideFee: order.event.hideFee,
      },
      items: order.items.map((item) => ({
        id: item.id,
        name: item.name,
        originalPrice: item.originalPrice,
        fee: item.fee,
        qty: item.qty,
        isBundle: item.isBundle,
        // Hanya nama dan varian komponen. Harga per komponen tidak dikirim.
        components: item.components.map((c) => ({
          id: c.id,
          productName: c.productName,
          size: c.size,
          variation: c.variation,
          qty: c.qty,
        })),
      })),
      user: {
        brandId: brandIdOf(user),
        name: user.name,
        brandName: user.brandName,
        avatarUpdatedAt: user.avatarUpdatedAt?.toISOString() ?? null,
        waMessageTemplate: user.waMessageTemplate,
      },
      // Cuma metode pembayaran yang aktif — ini yang ditampilkan ke pelanggan.
      paymentMethods: await listActivePaymentMethods(brandIdOf(user)),
    }
  })

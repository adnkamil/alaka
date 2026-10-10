import { createServerFn } from '@tanstack/react-start'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db'
import { events, items, orders } from '../db/schema'
import { brandIdOf } from './brand'
import { getSessionUser } from './auth'
import { findMergeTarget, mergeItemLines, mergePaidAmount } from './order-merge'
import { MAX_IMPORT_ORDERS } from './order-import'
import { derivePaymentStatus } from './order-totals'

/**
 * Import banyak pesanan sekaligus dari file Excel/CSV (halaman Detail Event).
 *
 * Parsing file-nya sudah dikerjakan di client (`order-import.ts`): satu entri =
 * satu pelanggan, itemnya sudah lengkap dengan fee hasil aturan fee event ini.
 * Tugas handler ini cuma menulis ke database dengan aturan yang SAMA seperti
 * `createOrder`:
 *
 * - Satu pelanggan = satu tagihan per event: barangnya digabung ke pesanan yang
 *   masih belum lunas/DP (aturan gabungnya di `order-merge.ts`). Pesanan yang
 *   sudah lunas/dikirim tetap dibiarkan terpisah.
 * - Hasil import selalu mulai dari **belum lunas** (nominal 0); pembayaran
 *   ditandai manual sesudahnya seperti pesanan biasa.
 *
 * Semua pesanan ditulis dalam SATU transaksi supaya tidak ada import yang
 * "setengah masuk" waktu salah satu gagal — isi event tetap bisa ditelusuri.
 */

const importItemSchema = z.object({
  name: z.string().min(1, 'Nama barang wajib diisi'),
  originalPrice: z.number().nonnegative(),
  fee: z.number().nonnegative(),
  qty: z.number().int().min(1, 'Jumlah minimal 1'),
})

const importOrderGroupSchema = z.object({
  customerName: z.string().min(1, 'Nama pelanggan wajib diisi'),
  customerPhone: z.string().max(30).nullable().optional(),
  items: z.array(importItemSchema).min(1, 'Minimal satu barang'),
})

const importOrdersSchema = z.object({
  eventId: z.uuid(),
  orders: z
    .array(importOrderGroupSchema)
    .min(1, 'Tidak ada data yang bisa diimport')
    .max(
      MAX_IMPORT_ORDERS,
      `Maksimal ${MAX_IMPORT_ORDERS} pelanggan sekali import`,
    ),
})

export const importOrders = createServerFn({ method: 'POST' })
  .validator(importOrdersSchema)
  .handler(async ({ data }) => {
    const user = await getSessionUser()
    if (!user) throw new Error('Belum login')

    const event = await db.query.events.findFirst({
      where: and(
        eq(events.id, data.eventId),
        eq(events.brandId, brandIdOf(user)),
      ),
    })
    if (!event) throw new Error('Event tidak ditemukan')

    // Event nonaktif = sudah ditutup, jadi tidak boleh nambah pesanan baru —
    // sama seperti `createOrder`.
    if (!event.isActive) {
      throw new Error(
        'Event ini sedang nonaktif. Aktifkan dulu lewat menu ⋮ di halaman event untuk menambah pesanan baru.',
      )
    }

    return db.transaction(async (tx) => {
      // Dibaca sekali di awal, lalu daftarnya ikut ditambah di dalam loop supaya
      // dua grup dengan nama pelanggan yang sama tidak bikin dua tagihan.
      const knownOrders = await tx.query.orders.findMany({
        where: eq(orders.eventId, data.eventId),
      })

      let created = 0
      let merged = 0
      let itemCount = 0

      for (const group of data.orders) {
        itemCount += group.items.length
        const mergeTarget = findMergeTarget(knownOrders, group.customerName)

        if (!mergeTarget) {
          const [order] = await tx
            .insert(orders)
            .values({
              eventId: data.eventId,
              customerName: group.customerName,
              customerPhone: group.customerPhone ?? null,
              // Belum ada uang yang masuk waktu import.
              paymentStatus: 'unpaid',
              paidAmount: '0',
            })
            .returning()

          await tx.insert(items).values(
            group.items.map((item) => ({
              orderId: order.id,
              name: item.name,
              originalPrice: item.originalPrice.toString(),
              fee: item.fee.toString(),
              qty: item.qty,
              obtained: false,
            })),
          )

          knownOrders.push(order)
          created++
          continue
        }

        // Barang lama dibawa apa adanya (termasuk checklist "sudah didapat"),
        // lalu digabung dengan barang dari file.
        const existingItems = await tx.query.items.findMany({
          where: eq(items.orderId, mergeTarget.id),
        })
        const mergedItems = mergeItemLines(
          existingItems.map((item) => ({
            name: item.name,
            originalPrice: Number(item.originalPrice),
            fee: Number(item.fee),
            qty: item.qty,
            obtained: item.obtained,
          })),
          group.items,
        )
        const mergedTotal = mergedItems.reduce(
          (sum, item) => sum + (item.originalPrice + item.fee) * item.qty,
          0,
        )
        // Barang dari file ini belum dibayar (nominal masuk 0), tapi uang yang
        // sudah masuk sebelumnya tetap dihitung dan tidak boleh lewat total.
        const mergedPaid = mergePaidAmount(
          mergeTarget.paidAmount,
          0,
          mergedTotal,
        )

        await tx
          .update(orders)
          .set({
            paymentStatus: derivePaymentStatus(mergedPaid, mergedTotal),
            paidAmount: mergedPaid.toString(),
            updatedAt: new Date(),
          })
          .where(eq(orders.id, mergeTarget.id))

        // Sama seperti `updateOrder`: baris barang diganti seluruhnya supaya
        // qty hasil penggabungan ikut tersimpan di baris yang sudah ada.
        await tx.delete(items).where(eq(items.orderId, mergeTarget.id))
        await tx.insert(items).values(
          mergedItems.map((item) => ({
            orderId: mergeTarget.id,
            name: item.name,
            originalPrice: item.originalPrice.toString(),
            fee: item.fee.toString(),
            qty: item.qty,
            obtained: Boolean(item.obtained),
          })),
        )

        // Grup berikutnya dengan nama yang sama harus lihat nominal terbaru.
        mergeTarget.paidAmount = mergedPaid.toString()
        merged++
      }

      return {
        created,
        merged,
        itemCount,
        customerCount: data.orders.length,
      }
    })
  })

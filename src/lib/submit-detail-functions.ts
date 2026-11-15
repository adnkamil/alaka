import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getSessionUser } from './auth'
import { brandIdOf } from './brand'

/**
 * Detail satu submit untuk jastiper: barang dikelompokkan per pemesan, dengan
 * status tiap barang. Handler memakai import dinamis supaya `db` tidak ikut
 * ke bundle client.
 */
export const getSubmitDetail = createServerFn({ method: 'GET' })
  .validator(z.object({ eventId: z.uuid(), submitNo: z.number().int().min(1) }))
  .handler(async ({ data }) => {
    const user = await getSessionUser()
    if (!user) throw new Error('Belum login')
    const { db } = await import('../db')
    const { eventSubmissions, events, items, itemComponents, orders } = await import('../db/schema')
    const { and, eq } = await import('drizzle-orm')

    const event = await db
      .select({ id: events.id, brandId: events.brandId })
      .from(events)
      .where(eq(events.id, data.eventId))
      .then((rows) => rows.at(0))
    if (!event || event.brandId !== brandIdOf(user)) throw new Error('Event tidak ditemukan')

    const sub = await db
      .select()
      .from(eventSubmissions)
      .where(and(eq(eventSubmissions.eventId, data.eventId), eq(eventSubmissions.submitNo, data.submitNo)))
      .then((rows) => rows.at(0))
    if (!sub) throw new Error('Submit tidak ditemukan')

    const satuan = await db
      .select({
        orderId: items.orderId,
        customerName: orders.customerName,
        name: items.name,
        qty: items.qty,
        status: items.submitStatus,
      })
      .from(items)
      .innerJoin(orders, eq(orders.id, items.orderId))
      .where(and(eq(items.submissionId, sub.id), eq(items.isBundle, false)))

    const komponen = await db
      .select({
        orderId: items.orderId,
        customerName: orders.customerName,
        productName: itemComponents.productName,
        size: itemComponents.size,
        variation: itemComponents.variation,
        componentQty: itemComponents.qty,
        bundleQty: items.qty,
        status: itemComponents.submitStatus,
      })
      .from(itemComponents)
      .innerJoin(items, eq(items.id, itemComponents.itemId))
      .innerJoin(orders, eq(orders.id, items.orderId))
      .where(eq(itemComponents.submissionId, sub.id))

    type Line = { key: string; name: string; qty: number; status: 'disetujui' | 'disanggah' | 'pengajuan' | null }
    const customers = new Map<string, { customerName: string; lines: Array<Line> }>()
    const add = (orderId: string, customerName: string, line: Line) => {
      const cur = customers.get(orderId) ?? { customerName, lines: [] }
      cur.lines.push(line)
      customers.set(orderId, cur)
    }
    for (const row of satuan) {
      add(row.orderId, row.customerName.trim(), {
        key: `s-${row.name}-${row.qty}-${row.status ?? ''}`,
        name: row.name,
        qty: row.qty,
        status: row.status,
      })
    }
    for (const row of komponen) {
      const label = [row.productName, row.size, row.variation].filter(Boolean).join(' / ')
      add(row.orderId, row.customerName.trim(), {
        key: `k-${label}-${row.componentQty}-${row.status ?? ''}`,
        name: `${label} (paket)`,
        qty: row.componentQty * row.bundleQty,
        status: row.status,
      })
    }

    return {
      submitNo: sub.submitNo,
      submittedAt: sub.submittedAt.toISOString(),
      customers: [...customers.values()]
        .sort((a, b) => a.customerName.localeCompare(b.customerName))
        .map((c) => ({ customerName: c.customerName, lines: c.lines })),
    }
  })

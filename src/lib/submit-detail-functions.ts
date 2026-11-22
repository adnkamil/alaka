import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getSessionUser } from './auth'
import { brandIdOf } from './brand'
import type { HoleStatus } from './submit-replacement'
import { splitItemName } from './partner-item-label'

type LineStatus = 'disetujui' | 'disanggah' | 'pengajuan' | 'dibatalkan' | null

/** Keadaan barang yang ditolak: perlu diganti atau tidak. Null = bukan barang ditolak. */
export type SubmitDetailHole = {
  status: HoleStatus
  /** Pcs yang masih bisa diganti. */
  openQty: number
  /** Menahan tagihan partner sampai jastiper memutuskan. */
  blocking: boolean
  /** Pengganti yang sudah dikirim untuk barang ini, di submit yang sama. */
  replacements: Array<{ name: string; qty: number; status: LineStatus }>
}

export type SubmitDetailLine = {
  key: string
  /** Id baris di database, untuk mengirim pengganti. */
  id: string
  kind: 'satuan' | 'komponen'
  name: string
  /** Nama produk saja, untuk tampilan. */
  product: string
  /** "Ukuran / Variasi", kosong kalau tidak ada. */
  variant: string
  /** Isi paket (komponen), bukan barang satuan. */
  inBundle: boolean
  qty: number
  status: LineStatus
  /**
   * Aturan paket yang membatasi penggantinya: aturan paket isi ini, atau aturan
   * yang mencakup variannya. Hanya diisi untuk barang yang ditolak. Null =
   * tidak punya aturan, penggantinya bebas dari semua produk.
   */
  ruleId: string | null
  hole: SubmitDetailHole | null
  /** Barang ini pengganti untuk barang yang ditolak. */
  replaces: { name: string } | null
  /** Id barang yang digantikan, untuk menyusun rantai pengganti. */
  replacesId: string | null
}

/**
 * Detail satu submit untuk jastiper: barang dikelompokkan per pemesan, dengan
 * status tiap barang. Barang yang ditolak membawa status penggantinya. Handler
 * memakai import dinamis supaya `db` tidak ikut ke bundle client.
 */
export const getSubmitDetail = createServerFn({ method: 'GET' })
  .validator(z.object({ eventId: z.uuid(), submitNo: z.number().int().min(1) }))
  .handler(async ({ data }) => {
    const user = await getSessionUser()
    if (!user) throw new Error('Belum login')
    const { db } = await import('../db')
    const { eventSubmissions, events, items, itemComponents, orders } = await import('../db/schema')
    const { and, eq } = await import('drizzle-orm')
    const { analyzeSubmits } = await import('./submit-replacement-groups')
    const { partnerItemName, variantLabel } = await import('./partner-item-label')

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
        id: items.id,
        orderId: items.orderId,
        customerName: orders.customerName,
        name: items.name,
        qty: items.qty,
        status: items.submitStatus,
        variantId: items.partnerVariantId,
        replacesItemId: items.replacesItemId,
        replacesComponentId: items.replacesComponentId,
      })
      .from(items)
      .innerJoin(orders, eq(orders.id, items.orderId))
      .where(and(eq(items.submissionId, sub.id), eq(items.isBundle, false)))

    const komponen = await db
      .select({
        id: itemComponents.id,
        orderId: items.orderId,
        customerName: orders.customerName,
        productName: itemComponents.productName,
        size: itemComponents.size,
        variation: itemComponents.variation,
        componentQty: itemComponents.qty,
        bundleQty: items.qty,
        ruleId: items.partnerRuleId,
        variantId: itemComponents.partnerVariantId,
        status: itemComponents.submitStatus,
        replacesItemId: itemComponents.replacesItemId,
        replacesComponentId: itemComponents.replacesComponentId,
      })
      .from(itemComponents)
      .innerJoin(items, eq(items.id, itemComponents.itemId))
      .innerJoin(orders, eq(orders.id, items.orderId))
      .where(eq(itemComponents.submissionId, sub.id))

    // Status "lubang" tiap barang: ditolak, sudah diganti, menunggu dicek, dst.
    const { holes } = await db.transaction((tx) =>
      analyzeSubmits(tx, [{ id: sub.id, checked: sub.stockCheckedAt !== null }]),
    )
    const holeById = new Map(holes.map((h) => [h.id, h]))

    // Nama barang di submit ini, untuk menyebut pengganti dan yang digantikan.
    const nameById = new Map<string, string>([
      ...satuan.map((r): [string, string] => [r.id, r.name]),
      ...komponen.map((r): [string, string] => [
        r.id,
        partnerItemName(r.productName, variantLabel({ size: r.size, variation: r.variation })),
      ]),
    ])

    // Aturan paket barang yang ditolak, dari variannya (dipakai kalau paketnya
    // tidak menyimpan aturan, dan untuk barang satuan).
    const { loadVariantInfo, findRuleForVariant } = await import('./partner-paket-queries')
    const ruleByVariant = await db.transaction(async (tx) => {
      const variantIds = [...satuan, ...komponen]
        .filter((r) => r.status === 'disanggah' && r.variantId)
        .map((r) => r.variantId as string)
      const info = await loadVariantInfo(tx, variantIds)
      const result = new Map<string, string | null>()
      for (const [variantId, v] of info) {
        const rule = await findRuleForVariant(tx, v.productId, v.size)
        result.set(variantId, rule?.id ?? null)
      }
      return result
    })
    const ruleOf = (r: { status: LineStatus; variantId: string | null }, bundleRuleId: string | null) =>
      r.status !== 'disanggah'
        ? null
        : (bundleRuleId ?? (r.variantId ? (ruleByVariant.get(r.variantId) ?? null) : null))

    const holeOf = (id: string): SubmitDetailHole | null => {
      const h = holeById.get(id)
      if (!h) return null
      return {
        status: h.status,
        openQty: h.openQty,
        blocking: h.blocking,
        replacements: h.replacements
          .filter((r) => r.status !== 'dibatalkan')
          .map((r) => ({
            name: nameById.get(r.id) ?? 'Barang',
            qty: r.qty,
            status: r.status,
          })),
      }
    }
    const replacesOf = (r: { replacesItemId: string | null; replacesComponentId: string | null }) => {
      const id = r.replacesItemId ?? r.replacesComponentId
      return id ? { name: nameById.get(id) ?? 'barang yang ditolak' } : null
    }

    const customers = new Map<string, { customerName: string; lines: Array<SubmitDetailLine> }>()
    const add = (orderId: string, customerName: string, line: SubmitDetailLine) => {
      const cur = customers.get(orderId) ?? { customerName, lines: [] }
      cur.lines.push(line)
      customers.set(orderId, cur)
    }
    for (const row of satuan) {
      const parts = splitItemName(row.name)
      add(row.orderId, row.customerName.trim(), {
        key: `s-${row.id}`,
        id: row.id,
        kind: 'satuan',
        name: row.name,
        product: parts.product,
        variant: [parts.size, parts.variation].filter(Boolean).join(' / '),
        inBundle: false,
        qty: row.qty,
        status: row.status,
        ruleId: ruleOf(row, null),
        hole: holeOf(row.id),
        replaces: replacesOf(row),
        replacesId: row.replacesItemId ?? row.replacesComponentId,
      })
    }
    for (const row of komponen) {
      const label = [row.productName, row.size, row.variation].filter(Boolean).join(' / ')
      add(row.orderId, row.customerName.trim(), {
        key: `k-${row.id}`,
        id: row.id,
        kind: 'komponen',
        name: `${label} (paket)`,
        product: row.productName,
        variant: [row.size, row.variation].filter(Boolean).join(' / '),
        inBundle: true,
        qty: row.componentQty * row.bundleQty,
        status: row.status,
        ruleId: ruleOf(row, row.ruleId),
        hole: holeOf(row.id),
        replaces: replacesOf(row),
        replacesId: row.replacesItemId ?? row.replacesComponentId,
      })
    }

    return {
      submitNo: sub.submitNo,
      submittedAt: sub.submittedAt.toISOString(),
      /** Pengganti sudah dikirim dan menunggu dicek partner. */
      reopened: sub.reopenedAt !== null && sub.stockCheckedAt === null,
      customers: [...customers.values()]
        .sort((a, b) => a.customerName.localeCompare(b.customerName))
        .map((c) => ({
          customerName: c.customerName,
          // Disetujui sebagian: ada baris disetujui dan baris kurang untuk produk yang sama.
          lines: c.lines.map((l) => ({
            ...l,
            partial:
              l.status === 'disetujui' &&
              c.lines.some((o) => o.status === 'disanggah' && o.name === l.name),
          })),
        })),
    }
  })

import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { requirePartner } from './partner-auth'
import { partnerOwnsEvent } from './partner-event-queries'
import { submitInvoiceState } from './invoice-rules'
import type { InvoiceStatus, SubmitInvoiceState } from './invoice-rules'
import { compareCheckQueue } from './submit-replacement'
import type { SlotStatus } from './event-slot'

export type PartnerSubmitRow = {
  submissionId: string
  /** Event belanja jastiper. */
  eventId: string
  brandId: string
  brandName: string
  waNumber: string | null
  submitNo: number
  /**
   * Submit dibuka lagi karena jastiper mengirim pengganti untuk barang yang
   * ditolak. Hanya barang penggantinya yang perlu dicek, dan submit ini
   * didahulukan di antrean.
   */
  reopened: boolean
  submittedAt: Date
  /**
   * Posisi di antrean cek stok event ini, 1 = pertama. Urut queue_seq, kecuali
   * submit yang dibuka lagi karena pengganti: didahulukan (`compareCheckQueue`).
   */
  queueRank: number
  /** Sudah dicek partner (stock_checked_at terisi). */
  checked: boolean
  checkedAt: Date | null
  pcs: {
    total: number
    approved: number
    rejected: number
    cancelled: number
    pending: number
  }
  /**
   * Nominal tagihan submit ini. Sudah ditagih: angka di tagihannya. Belum:
   * hasil pemaketan pcs disetujui di submit ini saja. Selama submit belum
   * siap (menunggu dicek atau keputusan jastiper), angka ini hanya estimasi.
   */
  approvedAmount: number
  /** Nilai barang yang masih menunggu cek (harga satuan). */
  pendingAmount: number
  /** Tagihan aktif yang memuat submit ini. */
  invoice: { id: string; number: number; status: InvoiceStatus } | null
  /** Posisi submit di alur tagihan. */
  invoiceState: SubmitInvoiceState
}

/** Pcs satu barang yang masuk satu paket saat ditagih. */
export type ItemPaketUse = {
  ruleName: string
  /** Harga satu paket menurut aturan. */
  bundlePrice: number
  /** Jumlah pcs dalam satu paket menurut aturan. */
  bundlePcs: number
  /** Pcs barang ini di dalam paket jenis tersebut. */
  qty: number
}

export type PartnerSubmitList = {
  rows: Array<PartnerSubmitRow>
  /**
   * Barang (id barang satuan atau isi paket) -> paket tempat pcs-nya masuk, untuk
   * submit yang belum ditagih. Sisa pcs ditagih satuan. Submit yang sudah
   * ditagih tidak ada di sini.
   */
  itemPaket: Record<string, Array<ItemPaketUse>>
  /**
   * Total tagihan per jastiper (brandId): submit yang sudah ditagih memakai
   * angka di tagihannya, submit lain memakai hasil pemaketan submitnya sendiri.
   */
  brandTotals: Record<string, number>
  /** Jastiper yang ikut tapi belum pernah submit. */
  notSubmitted: Array<{
    brandId: string
    brandName: string
    status: SlotStatus | null
  }>
}

/**
 * Satu baris per submit untuk seluruh jastiper di satu event partner.
 * Dibaca sekali jalan (tidak per jastiper). Kalau `brandId` diisi, hanya
 * submit jastiper itu yang dibaca (nomor antrean tetap menurut seluruh event).
 */
export const getPartnerSubmitList = createServerFn({ method: 'GET' })
  .validator(
    z.object({ calendarEventId: z.uuid(), brandId: z.uuid().optional() }),
  )
  .handler(async ({ data }): Promise<PartnerSubmitList> => {
    const partner = await requirePartner()
    if (!(await partnerOwnsEvent(partner.id, data.calendarEventId))) {
      throw new Error('Event tidak ditemukan')
    }
    const { db } = await import('../db')
    const schema = await import('../db/schema')
    const { listSlotQueue } = await import('./event-slot-queries')
    const { loadSubmitBilling } = await import('./submit-billing')
    const { analyzeSubmits } = await import('./submit-replacement-groups')
    const { poolInvoiceBilling } = await import('./invoice-pooling-queries')
    const { loadActiveInvoiceBySubmission, loadInvoicedAmountBySubmission } =
      await import('./invoice-queries')
    const { eventSubmissions, events, brands } = schema

    const subs = await db
      .select({
        submissionId: eventSubmissions.id,
        eventId: eventSubmissions.eventId,
        submitNo: eventSubmissions.submitNo,
        queueSeq: eventSubmissions.queueSeq,
        reopenedAt: eventSubmissions.reopenedAt,
        submittedAt: eventSubmissions.submittedAt,
        checkedAt: eventSubmissions.stockCheckedAt,
        brandId: brands.id,
        brandName: brands.name,
        waNumber: brands.waNumber,
      })
      .from(eventSubmissions)
      .innerJoin(events, eq(events.id, eventSubmissions.eventId))
      .innerJoin(brands, eq(brands.id, events.brandId))
      .where(
        and(
          eq(events.calendarEventId, data.calendarEventId),
          data.brandId ? eq(events.brandId, data.brandId) : undefined,
        ),
      )
      .orderBy(asc(eventSubmissions.queueSeq))
    const byCheckQueue = (
      a: {
        queueSeq: number
        reopenedAt: Date | null
        checkedAt: Date | null
      },
      b: typeof a,
    ) =>
      compareCheckQueue(
        { ...a, checked: a.checkedAt !== null },
        { ...b, checked: b.checkedAt !== null },
      )
    // Submit yang dibuka lagi karena pengganti tampil paling atas, sama dengan urutan cek.
    subs.sort(byCheckQueue)

    // Urutan antrean menurut seluruh event, bukan hanya submit yang dibaca.
    let rankById: Map<string, number> | null = null
    if (data.brandId) {
      const order = await db
        .select({
          id: eventSubmissions.id,
          queueSeq: eventSubmissions.queueSeq,
          reopenedAt: eventSubmissions.reopenedAt,
          checkedAt: eventSubmissions.stockCheckedAt,
        })
        .from(eventSubmissions)
        .innerJoin(events, eq(events.id, eventSubmissions.eventId))
        .where(eq(events.calendarEventId, data.calendarEventId))
        .orderBy(asc(eventSubmissions.queueSeq))
      order.sort(byCheckQueue)
      rankById = new Map(order.map((o, i) => [o.id, i + 1]))
    }

    const subIds = subs.map((s) => s.submissionId)
    const brandBySub = new Map(subs.map((s) => [s.submissionId, s.brandId]))
    const { billing, invoices, invoicedAmount, brandTotals, itemPaket, analysis } =
      await db.transaction(async (tx) => {
        const active = await loadActiveInvoiceBySubmission(tx, subIds)
        const snapshot = await loadInvoicedAmountBySubmission(tx, active)
        const raw = await loadSubmitBilling(tx, subIds)
        // Satu hitungan saja: pcs yang belum ditagih dipaketkan per submit,
        // jadi nominal satu submit tidak bergantung pada submit lain.
        const analysis = await analyzeSubmits(
          tx,
          subs.map((s) => ({
            id: s.submissionId,
            checked: s.checkedAt !== null,
          })),
        )
        const open = raw.poolable.filter((p) => !active.has(p.submissionId))
        const pooled = await poolInvoiceBilling(tx, {
          partnerId: partner.id,
          bySubmission: raw.bySubmission,
          poolable: open,
          groupOf: (id) => id,
        })
        const totals: Record<string, number> = {}
        for (const id of subIds) {
          const brandId = brandBySub.get(id) ?? ''
          const amount = active.has(id)
            ? (snapshot.get(id) ?? 0)
            : (pooled.bySubmission.get(id)?.approvedAmount ?? 0)
          totals[brandId] = (totals[brandId] ?? 0) + amount
        }
        const itemPaket: Record<string, Array<ItemPaketUse>> = {}
        for (const bundle of pooled.bundles) {
          const bundlePcs = bundle.parts.reduce((n, p) => n + p.qty, 0)
          for (const part of bundle.parts) {
            const uses = (itemPaket[part.itemId] ??= [])
            const same = uses.find(
              (u) =>
                u.ruleName === bundle.ruleName &&
                u.bundlePrice === bundle.bundlePrice,
            )
            if (same) same.qty += part.qty
            else
              uses.push({
                ruleName: bundle.ruleName,
                bundlePrice: bundle.bundlePrice,
                bundlePcs,
                qty: part.qty,
              })
          }
        }
        return {
          itemPaket,
          billing: pooled.bySubmission,
          invoices: active,
          invoicedAmount: snapshot,
          brandTotals: totals,
          analysis,
        }
      })

    const amountOf = (id: string) =>
      invoices.has(id)
        ? (invoicedAmount.get(id) ?? 0)
        : (billing.get(id)?.approvedAmount ?? 0)

    const rows: Array<PartnerSubmitRow> = subs.map((s, i) => {
      const b = billing.get(s.submissionId)
      const invoice = invoices.get(s.submissionId) ?? null
      const approvedAmount = amountOf(s.submissionId)
      const groupState = analysis.groups.get(s.submissionId)?.state
      return {
        submissionId: s.submissionId,
        eventId: s.eventId,
        brandId: s.brandId,
        brandName: s.brandName ?? 'Tanpa nama',
        waNumber: s.waNumber ?? null,
        submitNo: s.submitNo,
        reopened: s.reopenedAt !== null && s.checkedAt === null,
        submittedAt: s.submittedAt,
        queueRank: rankById?.get(s.submissionId) ?? i + 1,
        checked: s.checkedAt !== null,
        checkedAt: s.checkedAt,
        pcs: {
          total: b?.total ?? 0,
          approved: b?.approved ?? 0,
          rejected: b?.rejected ?? 0,
          cancelled: b?.cancelled ?? 0,
          pending: b?.pending ?? 0,
        },
        approvedAmount,
        pendingAmount: b?.pendingAmount ?? 0,
        invoice,
        invoiceState: submitInvoiceState({
          checked: groupState ? groupState !== 'menunggu_dicek' : s.checkedAt !== null,
          hasActiveInvoice: invoice !== null,
          approvedAmount,
          awaitingDecision: groupState === 'menunggu_keputusan',
        }),
      }
    })

    if (data.brandId) return { rows, itemPaket, brandTotals, notSubmitted: [] }

    const queue = await db.transaction((tx) =>
      listSlotQueue(tx, data.calendarEventId, new Date()),
    )
    const notSubmitted = queue
      .filter((q) => q.submittedAt === null)
      .map((q) => ({
        brandId: q.brandId,
        brandName: q.brandName ?? 'Tanpa nama',
        status: q.status,
      }))

    return { rows, itemPaket, brandTotals, notSubmitted }
  })

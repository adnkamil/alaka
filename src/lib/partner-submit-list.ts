import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { requirePartner } from './partner-auth'
import { partnerOwnsEvent } from './partner-event-queries'
import { submitInvoiceState } from './invoice-rules'
import type { InvoiceStatus, SubmitInvoiceState } from './invoice-rules'
import type { SlotStatus } from './event-slot'

export type PartnerSubmitRow = {
  submissionId: string
  /** Event belanja jastiper. */
  eventId: string
  brandId: string
  brandName: string
  waNumber: string | null
  submitNo: number
  submittedAt: Date
  /** Posisi di antrean cek stok event ini, 1 = pertama. Urut queue_seq. */
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
  /** Nominal tagihan submit ini (barang disetujui, paket memakai pembagian per submit). */
  approvedAmount: number
  /** Nilai barang yang masih menunggu cek (harga satuan). */
  pendingAmount: number
  /** Tagihan aktif yang memuat submit ini. */
  invoice: { id: string; number: number; status: InvoiceStatus } | null
  /** Posisi submit di alur tagihan. */
  invoiceState: SubmitInvoiceState
}

export type PartnerSubmitList = {
  rows: Array<PartnerSubmitRow>
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
    const { loadActiveInvoiceBySubmission } = await import('./invoice-queries')
    const { eventSubmissions, events, brands } = schema

    const subs = await db
      .select({
        submissionId: eventSubmissions.id,
        eventId: eventSubmissions.eventId,
        submitNo: eventSubmissions.submitNo,
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

    // Urutan antrean menurut seluruh event, bukan hanya submit yang dibaca.
    let rankById: Map<string, number> | null = null
    if (data.brandId) {
      const order = await db
        .select({ id: eventSubmissions.id })
        .from(eventSubmissions)
        .innerJoin(events, eq(events.id, eventSubmissions.eventId))
        .where(eq(events.calendarEventId, data.calendarEventId))
        .orderBy(asc(eventSubmissions.queueSeq))
      rankById = new Map(order.map((o, i) => [o.id, i + 1]))
    }

    const subIds = subs.map((s) => s.submissionId)
    const { billing, invoices } = await db.transaction(async (tx) => ({
      billing: (await loadSubmitBilling(tx, subIds)).bySubmission,
      invoices: await loadActiveInvoiceBySubmission(tx, subIds),
    }))

    const rows: Array<PartnerSubmitRow> = subs.map((s, i) => {
      const b = billing.get(s.submissionId)
      const invoice = invoices.get(s.submissionId) ?? null
      const approvedAmount = b?.approvedAmount ?? 0
      return {
        submissionId: s.submissionId,
        eventId: s.eventId,
        brandId: s.brandId,
        brandName: s.brandName ?? 'Tanpa nama',
        waNumber: s.waNumber ?? null,
        submitNo: s.submitNo,
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
          checked: s.checkedAt !== null,
          hasActiveInvoice: invoice !== null,
          approvedAmount,
        }),
      }
    })

    if (data.brandId) return { rows, notSubmitted: [] }

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

    return { rows, notSubmitted }
  })

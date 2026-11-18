import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getSessionUser } from './auth'
import { brandIdOf } from './brand'
import { requirePartner } from './partner-auth'
import {
  PAYMENT_PROOF_MAX_DATA_URL_LENGTH,
  parsePaymentProofDataUrl,
} from './payment-proof'
import type { InvoiceStatus } from './invoice-rules'
import { partnerOwnsEvent } from './partner-event-queries'

/**
 * Server function tagihan partner. Handler memakai import dinamis supaya `db`
 * tidak ikut ke bundle client. Logika ada di `invoice-queries.ts`.
 */

const idSchema = z.uuid()

export type InvoiceSummary = {
  id: string
  number: number
  status: InvoiceStatus
  totalAmount: number
  totalPcs: number
  sentAt: Date
  cancelledAt: Date | null
  cancelReason: string | null
  paidClaimedAt: Date | null
  paidConfirmedAt: Date | null
  /** Ada bukti bayar yang bisa dilihat di /api/invoice-proof/<id>. */
  hasProof: boolean
  /** Alasan partner menolak bukti bayar terakhir. */
  paymentRejectReason: string | null
}

/** Rekening tujuan pembayaran milik partner penagih. */
export type PartnerBankInfo = {
  bankName: string
  accountNumber: string
  accountName: string
}

export type InvoiceDetail = InvoiceSummary & {
  brandName: string
  /** Rekening partner saat ini. Null = partner belum mengisinya. */
  partnerBank: PartnerBankInfo | null
  /** Nomor submit yang masuk tagihan ini. */
  submitNos: Array<number>
  /** Snapshot saat tagihan dibuat, bukan hitung ulang dari harga katalog. */
  lines: Array<{
    id: string
    submitNo: number
    kind: 'satuan' | 'paket'
    label: string
    qty: number
    unitPrice: number
    amount: number
  }>
}

/** Partner mengirim tagihan untuk beberapa submit utuh milik satu jastiper. */
export const createInvoice = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      calendarEventId: idSchema,
      submissionIds: z.array(idSchema).min(1).max(200),
    }),
  )
  .handler(async ({ data }) => {
    const partner = await requirePartner()
    if (!(await partnerOwnsEvent(partner.id, data.calendarEventId))) {
      throw new Error('Event tidak ditemukan')
    }
    const { db } = await import('../db')
    const { createInvoiceTx } = await import('./invoice-queries')
    return db.transaction((tx) =>
      createInvoiceTx(tx, {
        partnerId: partner.id,
        calendarEventId: data.calendarEventId,
        submissionIds: data.submissionIds,
      }),
    )
  })

/** Partner membatalkan tagihan yang masih berstatus ditagih. */
export const cancelInvoice = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      invoiceId: idSchema,
      reason: z.string().trim().max(500).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const partner = await requirePartner()
    const { db } = await import('../db')
    const { cancelInvoiceTx } = await import('./invoice-queries')
    await db.transaction((tx) =>
      cancelInvoiceTx(tx, {
        partnerId: partner.id,
        invoiceId: data.invoiceId,
        reason: data.reason ? data.reason : null,
      }),
    )
  })

async function loadInvoiceDetail(invoiceId: string, scope: {
  partnerId?: string
  brandId?: string
}): Promise<InvoiceDetail> {
  const { db } = await import('../db')
  const { and, eq, asc } = await import('drizzle-orm')
  const {
    invoices,
    invoiceLines,
    invoiceSubmissions,
    eventSubmissions,
    brands,
    partners,
  } = await import('../db/schema')
  const invoice = await db
    .select({
      id: invoices.id,
      number: invoices.number,
      status: invoices.status,
      totalAmount: invoices.totalAmount,
      totalPcs: invoices.totalPcs,
      sentAt: invoices.sentAt,
      cancelledAt: invoices.cancelledAt,
      cancelReason: invoices.cancelReason,
      paidClaimedAt: invoices.paidClaimedAt,
      paidConfirmedAt: invoices.paidConfirmedAt,
      paymentProofStored: invoices.paymentProofStored,
      paymentRejectReason: invoices.paymentRejectReason,
      brandName: brands.name,
      bankName: partners.bankName,
      bankAccountNumber: partners.bankAccountNumber,
      bankAccountName: partners.bankAccountName,
    })
    .from(invoices)
    .innerJoin(brands, eq(brands.id, invoices.brandId))
    .innerJoin(partners, eq(partners.id, invoices.partnerId))
    .where(
      and(
        eq(invoices.id, invoiceId),
        scope.partnerId ? eq(invoices.partnerId, scope.partnerId) : undefined,
        scope.brandId ? eq(invoices.brandId, scope.brandId) : undefined,
      ),
    )
    .then((rows) => rows.at(0))
  if (!invoice) throw new Error('Tagihan tidak ditemukan')
  const subs = await db
    .select({
      id: invoiceSubmissions.submissionId,
      submitNo: eventSubmissions.submitNo,
    })
    .from(invoiceSubmissions)
    .innerJoin(
      eventSubmissions,
      eq(eventSubmissions.id, invoiceSubmissions.submissionId),
    )
    .where(eq(invoiceSubmissions.invoiceId, invoiceId))
    .orderBy(asc(eventSubmissions.submitNo))
  const submitNoById = new Map(subs.map((s) => [s.id, s.submitNo]))
  const lines = await db
    .select()
    .from(invoiceLines)
    .where(eq(invoiceLines.invoiceId, invoiceId))
  return {
    id: invoice.id,
    number: invoice.number,
    status: invoice.status,
    totalAmount: Number(invoice.totalAmount),
    totalPcs: invoice.totalPcs,
    sentAt: invoice.sentAt,
    cancelledAt: invoice.cancelledAt,
    cancelReason: invoice.cancelReason,
    paidClaimedAt: invoice.paidClaimedAt,
    paidConfirmedAt: invoice.paidConfirmedAt,
    hasProof: invoice.paymentProofStored,
    paymentRejectReason: invoice.paymentRejectReason,
    brandName: invoice.brandName ?? 'Jastiper',
    partnerBank:
      invoice.bankName && invoice.bankAccountNumber && invoice.bankAccountName
        ? {
            bankName: invoice.bankName,
            accountNumber: invoice.bankAccountNumber,
            accountName: invoice.bankAccountName,
          }
        : null,
    submitNos: subs.map((s) => s.submitNo),
    lines: lines
      .map((l) => ({
        id: l.id,
        submitNo: submitNoById.get(l.submissionId) ?? 0,
        kind: l.kind === 'paket' ? ('paket' as const) : ('satuan' as const),
        label: l.label,
        qty: l.qty,
        unitPrice: Number(l.unitPrice),
        amount: Number(l.amount),
      }))
      .sort((a, b) => a.submitNo - b.submitNo),
  }
}

/** Partner membuka rincian satu tagihan miliknya. */
export const getPartnerInvoice = createServerFn({ method: 'GET' })
  .validator(z.object({ invoiceId: idSchema }))
  .handler(async ({ data }) => {
    const partner = await requirePartner()
    return loadInvoiceDetail(data.invoiceId, { partnerId: partner.id })
  })

/** Jastiper membuka rincian satu tagihan untuk brand-nya (hanya baca). */
export const getJastiperInvoice = createServerFn({ method: 'GET' })
  .validator(z.object({ invoiceId: idSchema }))
  .handler(async ({ data }) => {
    const user = await getSessionUser()
    if (!user) throw new Error('Belum login')
    return loadInvoiceDetail(data.invoiceId, { brandId: brandIdOf(user) })
  })

/** Daftar tagihan untuk satu event belanja jastiper (terbaru dulu). */
export const listEventInvoices = createServerFn({ method: 'GET' })
  .validator(z.object({ eventId: idSchema }))
  .handler(async ({ data }): Promise<Array<InvoiceSummary>> => {
    const user = await getSessionUser()
    if (!user) throw new Error('Belum login')
    const { db } = await import('../db')
    const { and, desc, eq } = await import('drizzle-orm')
    const { invoices } = await import('../db/schema')
    const rows = await db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.eventId, data.eventId),
          eq(invoices.brandId, brandIdOf(user)),
        ),
      )
      .orderBy(desc(invoices.sentAt))
    return rows.map((r) => ({
      id: r.id,
      number: r.number,
      status: r.status,
      totalAmount: Number(r.totalAmount),
      totalPcs: r.totalPcs,
      sentAt: r.sentAt,
      cancelledAt: r.cancelledAt,
      cancelReason: r.cancelReason,
      paidClaimedAt: r.paidClaimedAt,
      paidConfirmedAt: r.paidConfirmedAt,
      hasProof: r.paymentProofStored,
      paymentRejectReason: r.paymentRejectReason,
    }))
  })

/** Jastiper mengaku sudah bayar dan mengunggah bukti (data URL gambar). */
export const claimInvoicePayment = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      invoiceId: idSchema,
      proofImage: z.string().max(PAYMENT_PROOF_MAX_DATA_URL_LENGTH),
    }),
  )
  .handler(async ({ data }) => {
    const user = await getSessionUser()
    if (!user) throw new Error('Belum login')
    // Cek isi gambar dulu (tipe asli + ukuran) sebelum menyentuh storage.
    const proof = parsePaymentProofDataUrl(data.proofImage)
    const { db } = await import('../db')
    const { claimInvoicePaymentTx } = await import('./invoice-queries')
    const { putInvoiceProof } = await import('./storage')
    await db.transaction((tx) =>
      claimInvoicePaymentTx(tx, {
        brandId: brandIdOf(user),
        invoiceId: data.invoiceId,
        storeProof: () =>
          putInvoiceProof(data.invoiceId, proof.bytes, proof.contentType),
      }),
    )
  })

/** Partner menandai tagihan lunas setelah mengecek bukti bayar. */
export const confirmInvoicePaid = createServerFn({ method: 'POST' })
  .validator(z.object({ invoiceId: idSchema }))
  .handler(async ({ data }) => {
    const partner = await requirePartner()
    const { db } = await import('../db')
    const { confirmInvoicePaidTx } = await import('./invoice-queries')
    await db.transaction((tx) =>
      confirmInvoicePaidTx(tx, {
        partnerId: partner.id,
        invoiceId: data.invoiceId,
      }),
    )
  })

/** Partner menolak bukti bayar: tagihan kembali ke ditagih. */
export const rejectInvoicePayment = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      invoiceId: idSchema,
      reason: z.string().trim().max(500).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const partner = await requirePartner()
    const { db } = await import('../db')
    const { rejectInvoicePaymentTx } = await import('./invoice-queries')
    await db.transaction((tx) =>
      rejectInvoicePaymentTx(tx, {
        partnerId: partner.id,
        invoiceId: data.invoiceId,
        reason: data.reason ? data.reason : null,
      }),
    )
    // Bukti yang ditolak dibuang; kegagalan hapus tidak membatalkan penolakan.
    const { deleteInvoiceProof } = await import('./storage')
    await deleteInvoiceProof(data.invoiceId).catch(() => undefined)
  })

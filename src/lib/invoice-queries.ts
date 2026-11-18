// Tagihan partner ke jastiper (server-only, menerima `tx` dari pemanggil).
// Aturan murni ada di `invoice-rules.ts`.
import { and, eq, inArray, isNull } from 'drizzle-orm'
import {
  eventSubmissions,
  events,
  invoiceLines,
  invoiceSubmissions,
  invoices,
  notifications,
  partners,
} from '../db/schema'
import { chunk } from './chunk'
import {
  BANK_REQUIRED_MESSAGE,
  formatInvoiceNumber,
  hasBankAccount,
  nextInvoiceStatus,
  submitInvoiceState,
  validateInvoiceSelection,
} from './invoice-rules'
import { formatRupiah } from './partner-product-rules'
import { loadSubmitBilling } from './submit-billing'
import type { InvoiceStatus } from './invoice-rules'
import type { OrderTx } from './order-status-queries'

export const INVOICED_MESSAGE =
  'Barang ini sudah ditagih. Batalkan tagihannya dulu.'

/** Submit yang sedang ada di tagihan aktif (belum dilepas). */
export async function loadActiveInvoiceBySubmission(
  tx: OrderTx,
  submissionIds: Array<string>,
): Promise<
  Map<string, { id: string; number: number; status: InvoiceStatus }>
> {
  const result = new Map<
    string,
    { id: string; number: number; status: InvoiceStatus }
  >()
  if (submissionIds.length === 0) return result
  const rows = await tx
    .select({
      submissionId: invoiceSubmissions.submissionId,
      id: invoices.id,
      number: invoices.number,
      status: invoices.status,
    })
    .from(invoiceSubmissions)
    .innerJoin(invoices, eq(invoices.id, invoiceSubmissions.invoiceId))
    .where(
      and(
        inArray(invoiceSubmissions.submissionId, submissionIds),
        isNull(invoiceSubmissions.releasedAt),
      ),
    )
  for (const r of rows) {
    result.set(r.submissionId, { id: r.id, number: r.number, status: r.status })
  }
  return result
}

/** True kalau submit ada di tagihan aktif. Barangnya tidak boleh berubah. */
export async function isSubmissionInvoiced(
  tx: OrderTx,
  submissionId: string,
): Promise<boolean> {
  const rows = await tx
    .select({ id: invoiceSubmissions.submissionId })
    .from(invoiceSubmissions)
    .where(
      and(
        eq(invoiceSubmissions.submissionId, submissionId),
        isNull(invoiceSubmissions.releasedAt),
      ),
    )
    .limit(1)
  return rows.length > 0
}

/** Himpunan submit (dari daftar) yang sedang ditagih. */
export async function invoicedSubmissionIds(
  tx: OrderTx,
  submissionIds: Array<string>,
): Promise<Set<string>> {
  return new Set((await loadActiveInvoiceBySubmission(tx, submissionIds)).keys())
}

/**
 * Buat satu tagihan dari beberapa submit utuh milik satu jastiper. Semua
 * aturan dicek di sini, dalam transaksi pemanggil.
 */
export async function createInvoiceTx(
  tx: OrderTx,
  input: {
    partnerId: string
    calendarEventId: string
    submissionIds: Array<string>
  },
): Promise<{ invoiceId: string; number: number }> {
  // Tanpa rekening, jastiper tidak tahu ke mana harus bayar.
  const partner = await tx
    .select({
      bankName: partners.bankName,
      bankAccountNumber: partners.bankAccountNumber,
      bankAccountName: partners.bankAccountName,
    })
    .from(partners)
    .where(eq(partners.id, input.partnerId))
    .then((rows) => rows.at(0))
  if (!partner || !hasBankAccount(partner)) {
    throw new Error(BANK_REQUIRED_MESSAGE)
  }

  const requestedIds = [...new Set(input.submissionIds)]
  // Kunci submit supaya dua tagihan bersamaan tidak memakai submit yang sama.
  const subs = requestedIds.length
    ? await tx
        .select({
          id: eventSubmissions.id,
          submitNo: eventSubmissions.submitNo,
          checkedAt: eventSubmissions.stockCheckedAt,
          eventId: events.id,
          brandId: events.brandId,
        })
        .from(eventSubmissions)
        .innerJoin(events, eq(events.id, eventSubmissions.eventId))
        .where(
          and(
            inArray(eventSubmissions.id, requestedIds),
            eq(events.calendarEventId, input.calendarEventId),
          ),
        )
        .for('update', { of: eventSubmissions })
    : []

  const foundIds = subs.map((s) => s.id)
  const active = await loadActiveInvoiceBySubmission(tx, foundIds)
  const { bySubmission, crossBundles } = await loadSubmitBilling(tx, foundIds)

  const error = validateInvoiceSelection({
    requestedIds,
    candidates: subs.map((s) => ({
      id: s.id,
      submitNo: s.submitNo,
      brandId: s.brandId,
      state: submitInvoiceState({
        checked: s.checkedAt !== null,
        hasActiveInvoice: active.has(s.id),
        approvedAmount: bySubmission.get(s.id)?.approvedAmount ?? 0,
      }),
    })),
    crossBundles,
  })
  if (error) throw new Error(error)

  const first = subs[0]
  const totalAmount = subs.reduce(
    (s, x) => s + (bySubmission.get(x.id)?.approvedAmount ?? 0),
    0,
  )
  const totalPcs = subs.reduce(
    (s, x) => s + (bySubmission.get(x.id)?.approved ?? 0),
    0,
  )

  const [invoice] = await tx
    .insert(invoices)
    .values({
      calendarEventId: input.calendarEventId,
      partnerId: input.partnerId,
      eventId: first.eventId,
      brandId: first.brandId,
      totalAmount: totalAmount.toFixed(2),
      totalPcs,
    })
    .returning({ id: invoices.id, number: invoices.number })

  await tx.insert(invoiceSubmissions).values(
    subs.map((s) => ({
      invoiceId: invoice.id,
      submissionId: s.id,
      amount: (bySubmission.get(s.id)?.approvedAmount ?? 0).toFixed(2),
      pcs: bySubmission.get(s.id)?.approved ?? 0,
    })),
  )
  const lines = subs.flatMap((s) => bySubmission.get(s.id)?.lines ?? [])
  for (const part of chunk(lines, 500)) {
    await tx.insert(invoiceLines).values(
      part.map((l) => ({
        invoiceId: invoice.id,
        submissionId: l.submissionId,
        kind: l.kind,
        label: l.label,
        qty: l.qty,
        unitPrice: l.unitPrice.toFixed(2),
        amount: l.amount.toFixed(2),
      })),
    )
  }

  await tx.insert(notifications).values({
    brandId: first.brandId,
    kind: 'tagihan',
    title: `Tagihan ${formatInvoiceNumber(invoice.number)}: ${formatRupiah(totalAmount)}`,
    body: `Submit ke-${subs
      .map((s) => s.submitNo)
      .sort((a, b) => a - b)
      .join(', ')} · ${totalPcs} pcs`,
    target: 'event',
    eventId: first.eventId,
    calendarEventId: input.calendarEventId,
  })

  return { invoiceId: invoice.id, number: invoice.number }
}

/** Ambil dan kunci satu tagihan milik partner atau brand. */
async function lockInvoice(
  tx: OrderTx,
  invoiceId: string,
  scope: { partnerId?: string; brandId?: string },
) {
  const invoice = await tx
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.id, invoiceId),
        scope.partnerId ? eq(invoices.partnerId, scope.partnerId) : undefined,
        scope.brandId ? eq(invoices.brandId, scope.brandId) : undefined,
      ),
    )
    .for('update')
    .then((rows) => rows.at(0))
  if (!invoice) throw new Error('Tagihan tidak ditemukan.')
  return invoice
}

/** Batalkan tagihan yang masih berstatus ditagih; submitnya bebas ditagih lagi. */
export async function cancelInvoiceTx(
  tx: OrderTx,
  input: { partnerId: string; invoiceId: string; reason: string | null },
): Promise<void> {
  const invoice = await lockInvoice(tx, input.invoiceId, {
    partnerId: input.partnerId,
  })
  const next = nextInvoiceStatus(invoice.status, 'cancel')
  const now = new Date()
  await tx
    .update(invoices)
    .set({
      status: next,
      cancelledAt: now,
      cancelReason: input.reason,
      updatedAt: now,
    })
    .where(eq(invoices.id, invoice.id))
  await tx
    .update(invoiceSubmissions)
    .set({ releasedAt: now })
    .where(eq(invoiceSubmissions.invoiceId, invoice.id))
  await tx.insert(notifications).values({
    brandId: invoice.brandId,
    kind: 'tagihan',
    title: `Tagihan ${formatInvoiceNumber(invoice.number)} dibatalkan`,
    body: input.reason,
    target: 'event',
    eventId: invoice.eventId,
    calendarEventId: invoice.calendarEventId,
  })
}

/**
 * Jastiper mengaku sudah bayar: tagihan menunggu review partner. Bukti bayar
 * disimpan pemanggil (di Blobs) dalam transaksi yang sama.
 */
export async function claimInvoicePaymentTx(
  tx: OrderTx,
  input: {
    brandId: string
    invoiceId: string
    /** Dipanggil setelah tagihan terkunci dan lolos cek, untuk menyimpan bukti. */
    storeProof: () => Promise<void>
  },
): Promise<void> {
  const invoice = await lockInvoice(tx, input.invoiceId, {
    brandId: input.brandId,
  })
  const next = nextInvoiceStatus(invoice.status, 'claim_paid')
  await input.storeProof()
  const now = new Date()
  await tx
    .update(invoices)
    .set({
      status: next,
      paidClaimedAt: now,
      paymentProofStored: true,
      paymentRejectReason: null,
      updatedAt: now,
    })
    .where(eq(invoices.id, invoice.id))
}

/** Partner menandai tagihan lunas setelah mengecek bukti bayar. */
export async function confirmInvoicePaidTx(
  tx: OrderTx,
  input: { partnerId: string; invoiceId: string },
): Promise<void> {
  const invoice = await lockInvoice(tx, input.invoiceId, {
    partnerId: input.partnerId,
  })
  const next = nextInvoiceStatus(invoice.status, 'confirm_paid')
  const now = new Date()
  await tx
    .update(invoices)
    .set({ status: next, paidConfirmedAt: now, updatedAt: now })
    .where(eq(invoices.id, invoice.id))
  await tx.insert(notifications).values({
    brandId: invoice.brandId,
    kind: 'tagihan',
    title: `Tagihan ${formatInvoiceNumber(invoice.number)} lunas`,
    body: 'Partner sudah mengonfirmasi pembayaranmu.',
    target: 'event',
    eventId: invoice.eventId,
    calendarEventId: invoice.calendarEventId,
  })
}

/** Partner menolak bukti bayar: tagihan kembali ke ditagih. */
export async function rejectInvoicePaymentTx(
  tx: OrderTx,
  input: { partnerId: string; invoiceId: string; reason: string | null },
): Promise<void> {
  const invoice = await lockInvoice(tx, input.invoiceId, {
    partnerId: input.partnerId,
  })
  const next = nextInvoiceStatus(invoice.status, 'reject_payment')
  const now = new Date()
  await tx
    .update(invoices)
    .set({
      status: next,
      paidClaimedAt: null,
      paymentProofStored: false,
      paymentRejectReason: input.reason,
      updatedAt: now,
    })
    .where(eq(invoices.id, invoice.id))
  await tx.insert(notifications).values({
    brandId: invoice.brandId,
    kind: 'tagihan',
    title: `Bukti bayar ${formatInvoiceNumber(invoice.number)} ditolak`,
    body: input.reason ?? 'Kirim ulang bukti bayar yang jelas.',
    target: 'event',
    eventId: invoice.eventId,
    calendarEventId: invoice.calendarEventId,
  })
}

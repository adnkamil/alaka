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
  subscriptionSettings,
} from '../db/schema'
import { chunk } from './chunk'
import { centsToDecimal, computeAdminFee } from './partner-credit'
import { postCreditEntry } from './partner-credit-queries'
import { poolInvoiceBilling } from './invoice-pooling-queries'
import { analyzeSubmits } from './submit-replacement-groups'
import { waiveHolesTx } from './submit-replacement-queries'
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

/**
 * Nominal tiap submit di tagihan aktifnya (jumlah baris snapshot). Angka ini
 * tetap walau harga atau aturan paket berubah setelah tagihan dibuat.
 */
export async function loadInvoicedAmountBySubmission(
  tx: OrderTx,
  active: Map<string, { id: string }>,
): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  const invoiceIds = [...new Set([...active.values()].map((v) => v.id))]
  if (invoiceIds.length === 0) return result
  const rows = await tx
    .select({
      invoiceId: invoiceLines.invoiceId,
      submissionId: invoiceLines.submissionId,
      amount: invoiceLines.amount,
    })
    .from(invoiceLines)
    .where(inArray(invoiceLines.invoiceId, invoiceIds))
  for (const r of rows) {
    if (active.get(r.submissionId)?.id !== r.invoiceId) continue
    result.set(r.submissionId, (result.get(r.submissionId) ?? 0) + Number(r.amount))
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
 * Muat, validasi, dan hitung satu tagihan: pilihan submit dicek, semua pcs
 * disetujui dijadikan paket menurut aturan partner, lalu total dihitung.
 * Dipakai pembuatan tagihan dan pratinjaunya supaya angkanya sama. Melempar
 * Error kalau pilihan tidak valid.
 */
async function planInvoice(
  tx: OrderTx,
  input: {
    partnerId: string
    calendarEventId: string
    submissionIds: Array<string>
    /** "Tagih apa adanya": isi paket yang ditolak dan belum diputuskan dianggap tidak diganti. */
    waiveBlocking?: boolean
  },
  lock: boolean,
) {
  const requestedIds = [...new Set(input.submissionIds)]
  // Saat membuat tagihan, submit dikunci supaya dua tagihan bersamaan tidak
  // memakai submit yang sama. Pratinjau tidak mengunci apa pun.
  const subsQuery = tx
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
  const subs = requestedIds.length
    ? lock
      ? await subsQuery.for('update', { of: eventSubmissions })
      : await subsQuery
    : []

  const foundIds = subs.map((s) => s.id)
  const active = await loadActiveInvoiceBySubmission(tx, foundIds)
  const { bySubmission, poolable } = await loadSubmitBilling(tx, foundIds)
  // Submit yang dibuka lagi karena ada pengganti belum dicek, dan isi paket
  // yang ditolak belum diputuskan jastiper, sama-sama menahan tagihan.
  const { groups, holes } = await analyzeSubmits(
    tx,
    subs.map((s) => ({ id: s.id, checked: s.checkedAt !== null })),
  )

  const error = validateInvoiceSelection({
    requestedIds,
    candidates: subs.map((s) => ({
      id: s.id,
      submitNo: s.submitNo,
      brandId: s.brandId,
      state: submitInvoiceState({
        checked: groups.get(s.id)?.state !== 'menunggu_dicek',
        hasActiveInvoice: active.has(s.id),
        approvedAmount: bySubmission.get(s.id)?.approvedAmount ?? 0,
        awaitingDecision:
          groups.get(s.id)?.state === 'menunggu_keputusan' &&
          !input.waiveBlocking,
      }),
    })),
  })
  if (error) throw new Error(error)

  // Partner menghitung per jastiper: pcs disetujui di satu submit dijadikan
  // paket menurut aturan partner, tanpa melihat bentuk pesanan customer.
  // Submit lain tidak ikut, jadi nominal satu submit tidak berubah karena
  // submit lain ikut atau tidak ikut ditagih.
  const { bySubmission: billing, bundleCount } = await poolInvoiceBilling(tx, {
    partnerId: input.partnerId,
    bySubmission,
    poolable,
    groupOf: (id) => id,
  })

  const totalAmount = subs.reduce(
    (s, x) => s + (billing.get(x.id)?.approvedAmount ?? 0),
    0,
  )
  const totalPcs = subs.reduce((s, x) => s + (billing.get(x.id)?.approved ?? 0), 0)
  const rawAmount = subs.reduce(
    (s, x) => s + (bySubmission.get(x.id)?.approvedAmount ?? 0),
    0,
  )

  // Isi paket yang ditolak dan belum diputuskan. Hanya ada kalau
  // `waiveBlocking` (kalau tidak, validasi di atas sudah menolak).
  const selected = new Set(foundIds)
  const blockingHoles = holes
    .filter((h) => h.blocking && selected.has(h.submissionId))
    .map((h) => ({ kind: h.kind, id: h.id }))

  return {
    subs,
    billing,
    totalAmount,
    totalPcs,
    rawAmount,
    bundleCount,
    blockingHoles,
  }
}


export type InvoicePreviewLine = {
  kind: 'satuan' | 'paket'
  label: string
  qty: number
  unitPrice: number
  amount: number
  /** Alasan baris satuan tidak jadi paket (mis. "Kurang 1 pcs lagi untuk ..."). */
  note?: string
}

/** Jumlahkan baris dengan jenis, nama, dan harga yang sama. */
function mergePreviewLines(
  lines: Array<InvoicePreviewLine>,
): Array<InvoicePreviewLine> {
  const merged = new Map<string, InvoicePreviewLine>()
  for (const l of lines) {
    const key = `${l.kind}\u0000${l.label}\u0000${l.unitPrice}\u0000${l.note ?? ''}`
    const cur = merged.get(key)
    if (cur) {
      cur.qty += l.qty
      cur.amount += l.amount
    } else {
      merged.set(key, { ...l })
    }
  }
  return [...merged.values()].sort(
    (a, b) => Number(a.kind === 'paket') - Number(b.kind === 'paket'),
  )
}

export type InvoicePreviewResult =
  | {
      ok: true
      submitCount: number
      totalPcs: number
      /** Total kalau semua pcs ditagih satuan. */
      rawAmount: number
      /** Total tagihan setelah pcs dijadikan paket. */
      totalAmount: number
      /** Selisih `rawAmount` dan `totalAmount`. */
      saving: number
      /** Jumlah paket di tagihan. */
      bundleCount: number
      /** Rincian tagihan: baris yang sama dari semua submit dijumlahkan. */
      lines: Array<InvoicePreviewLine>
    }
  | { ok: false; error: string }

/** Hitung tagihan tanpa membuatnya. Tidak mengunci dan tidak menulis. */
export async function previewInvoiceTx(
  tx: OrderTx,
  input: {
    partnerId: string
    calendarEventId: string
    submissionIds: Array<string>
    waiveBlocking?: boolean
  },
): Promise<InvoicePreviewResult> {
  try {
    const plan = await planInvoice(tx, input, false)
    return {
      ok: true,
      submitCount: plan.subs.length,
      totalPcs: plan.totalPcs,
      rawAmount: plan.rawAmount,
      totalAmount: plan.totalAmount,
      saving: plan.rawAmount - plan.totalAmount,
      bundleCount: plan.bundleCount,
      lines: mergePreviewLines(
        plan.subs.flatMap((x) => plan.billing.get(x.id)?.lines ?? []),
      ),
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Tagihan tidak valid.',
    }
  }
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
    /** "Tagih apa adanya": isi paket yang ditolak dan belum diputuskan tidak diganti. */
    waiveBlocking?: boolean
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

  const { subs, billing, totalAmount, totalPcs, blockingHoles } =
    await planInvoice(tx, input, true)
  const first = subs[0]

  // Barang yang ditolak dan belum diputuskan dicatat tidak diganti, supaya
  // jastiper tidak bisa mengirim pengganti untuk tagihan yang sudah terbit.
  await waiveHolesTx(tx, {
    eventId: first.eventId,
    holes: blockingHoles,
    by: 'partner',
    now: new Date(),
  })

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
      amount: (billing.get(s.id)?.approvedAmount ?? 0).toFixed(2),
      pcs: billing.get(s.id)?.approved ?? 0,
    })),
  )
  const lines = subs.flatMap((s) => billing.get(s.id)?.lines ?? [])
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

  // Biaya admin ALAKA: persen saat ini di-snapshot ke tagihan, lalu dipotong
  // dari saldo kredit partner. Saldo boleh minus (tunggakan sampai top up).
  // Lunas tidak bisa dibatalkan, jadi potongan ini tidak pernah perlu dibalik.
  const settings = await tx
    .select({ adminFeePercent: subscriptionSettings.adminFeePercent })
    .from(subscriptionSettings)
    .limit(1)
    .then((rows) => rows.at(0))
  const adminFeePercent = settings?.adminFeePercent ?? '0'
  const adminFee = computeAdminFee(invoice.totalAmount, adminFeePercent)

  await tx
    .update(invoices)
    .set({
      status: next,
      paidConfirmedAt: now,
      adminFeePercent,
      adminFeeAmount: centsToDecimal(adminFee * 100),
      updatedAt: now,
    })
    .where(eq(invoices.id, invoice.id))
  if (adminFee > 0) {
    await postCreditEntry(tx, invoice.partnerId, {
      type: 'admin_fee',
      amount: -adminFee,
      invoiceId: invoice.id,
    })
  }
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

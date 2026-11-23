import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requirePartner } from './partner-auth'
import {
  PAYMENT_PROOF_MAX_DATA_URL_LENGTH,
  parsePaymentProofDataUrl,
} from './payment-proof'
import { isPartnerTopupAmount } from './partner-credit'

/**
 * Saldo kredit partner dari sisi partner: ringkasan saldo + riwayat, info QRIS,
 * dan pengajuan top up manual. Verifikasi admin ada di
 * `admin-partner-credit-functions.ts`. Handler memakai import dinamis supaya
 * `db` tidak ikut ke bundle client.
 */

export type PartnerCreditEntry = {
  id: string
  type: 'topup' | 'admin_fee' | 'adjustment'
  amount: number
  balanceAfter: number
  note: string | null
  /** Tagihan asal biaya admin (type `admin_fee`). */
  invoice: { id: string; number: number } | null
  createdAt: Date
}

export type PartnerTopupRow = {
  id: string
  amount: number
  status: 'pending' | 'approved' | 'rejected'
  reviewNote: string | null
  createdAt: Date
  reviewedAt: Date | null
}

export type PartnerCreditOverview = {
  balance: number
  pendingTopup: PartnerTopupRow | null
  entries: Array<PartnerCreditEntry>
  topups: Array<PartnerTopupRow>
}

/** Saldo, top up yang menunggu, riwayat mutasi, dan riwayat top up partner. */
export const fetchPartnerCreditOverview = createServerFn({ method: 'GET' }).handler(
  async (): Promise<PartnerCreditOverview> => {
    const partner = await requirePartner()
    const { db } = await import('../db')
    const { desc, eq } = await import('drizzle-orm')
    const { invoices, partnerCreditLedger, partnerTopups, partners } = await import(
      '../db/schema'
    )

    const [balanceRow, entryRows, topupRows] = await Promise.all([
      db
        .select({ creditBalance: partners.creditBalance })
        .from(partners)
        .where(eq(partners.id, partner.id))
        .then((rows) => rows.at(0)),
      db
        .select({
          id: partnerCreditLedger.id,
          type: partnerCreditLedger.type,
          amount: partnerCreditLedger.amount,
          balanceAfter: partnerCreditLedger.balanceAfter,
          note: partnerCreditLedger.note,
          invoiceId: partnerCreditLedger.invoiceId,
          invoiceNumber: invoices.number,
          createdAt: partnerCreditLedger.createdAt,
        })
        .from(partnerCreditLedger)
        .leftJoin(invoices, eq(invoices.id, partnerCreditLedger.invoiceId))
        .where(eq(partnerCreditLedger.partnerId, partner.id))
        .orderBy(desc(partnerCreditLedger.createdAt))
        .limit(50),
      db
        .select({
          id: partnerTopups.id,
          amount: partnerTopups.amount,
          status: partnerTopups.status,
          reviewNote: partnerTopups.reviewNote,
          createdAt: partnerTopups.createdAt,
          reviewedAt: partnerTopups.reviewedAt,
        })
        .from(partnerTopups)
        .where(eq(partnerTopups.partnerId, partner.id))
        .orderBy(desc(partnerTopups.createdAt))
        .limit(20),
    ])

    const topups = topupRows.map((t) => ({ ...t, amount: Number(t.amount) }))
    return {
      balance: Number(balanceRow?.creditBalance ?? 0),
      pendingTopup: topups.find((t) => t.status === 'pending') ?? null,
      entries: entryRows.map((e) => ({
        id: e.id,
        type: e.type,
        amount: Number(e.amount),
        balanceAfter: Number(e.balanceAfter),
        note: e.note,
        invoice:
          e.invoiceId && e.invoiceNumber !== null
            ? { id: e.invoiceId, number: e.invoiceNumber }
            : null,
        createdAt: e.createdAt,
      })),
      topups,
    }
  },
)

/** QRIS admin untuk top up (sama dengan QRIS pembayaran PRO jastiper). */
export const fetchPartnerTopupPaymentInfo = createServerFn({ method: 'GET' }).handler(
  async () => {
    await requirePartner()
    const { getSubscriptionSettings } = await import('./subscription-settings-queries')
    const settings = await getSubscriptionSettings()
    return {
      qrisImage: settings?.qrisImage ?? null,
      qrisString: settings?.qrisString ?? null,
    }
  },
)

const submitTopupSchema = z.object({
  amount: z.number().refine(isPartnerTopupAmount, 'Pilih nominal top up yang tersedia.'),
  paymentProofImage: z
    .string()
    .max(PAYMENT_PROOF_MAX_DATA_URL_LENGTH, 'Ukuran bukti transfer maksimal 1MB'),
})

/**
 * Partner mengirim bukti transfer top up. Saldo baru bertambah setelah admin
 * menyetujui. Maksimal satu top up manual yang menunggu per partner.
 */
export const submitPartnerTopup = createServerFn({ method: 'POST' })
  .validator(submitTopupSchema)
  .handler(async ({ data }) => {
    const partner = await requirePartner()
    const { db } = await import('../db')
    const { and, eq } = await import('drizzle-orm')
    const { partnerTopups } = await import('../db/schema')
    const { deleteTopupProof, putTopupProof } = await import('./storage')

    // Cek isi gambar dulu (tipe asli + ukuran) sebelum menyentuh storage.
    const proof = parsePaymentProofDataUrl(data.paymentProofImage)

    const pending = await db
      .select({ id: partnerTopups.id })
      .from(partnerTopups)
      .where(
        and(
          eq(partnerTopups.partnerId, partner.id),
          eq(partnerTopups.status, 'pending'),
          eq(partnerTopups.method, 'manual_qris'),
        ),
      )
      .then((rows) => rows.at(0))
    if (pending) {
      throw new Error('Kamu masih punya top up yang menunggu verifikasi.')
    }

    const id = globalThis.crypto.randomUUID()
    await putTopupProof(id, proof.bytes, proof.contentType)
    try {
      await db.insert(partnerTopups).values({
        id,
        partnerId: partner.id,
        amount: data.amount.toFixed(2),
        method: 'manual_qris',
        status: 'pending',
        paymentProofStored: true,
        paidAt: new Date(),
      })
    } catch (err) {
      await deleteTopupProof(id).catch((cleanupErr: unknown) => {
        console.error('Gagal membersihkan bukti top up yatim:', cleanupErr)
      })
      // Dua kiriman bersamaan: yang kalah kena unique index pending.
      const code = (err as { cause?: { code?: string }; code?: string }).cause?.code ??
        (err as { code?: string }).code
      if (code === '23505') {
        throw new Error('Kamu masih punya top up yang menunggu verifikasi.')
      }
      throw err
    }
    return { id }
  })

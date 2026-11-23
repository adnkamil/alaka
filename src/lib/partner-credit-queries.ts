// Penulisan saldo kredit partner (server-only, menerima `tx`). Satu-satunya
// jalan mengubah `partners.credit_balance`: selalu bersama satu baris
// `partner_credit_ledger` di transaksi yang sama.
import { eq } from 'drizzle-orm'
import { partnerCreditLedger, partnerTopups, partners } from '../db/schema'
import { nextBalance } from './partner-credit'
import type { OrderTx } from './order-status-queries'

export type CreditEntryInput =
  | { type: 'topup'; amount: string | number; topupId: string; createdBy: string | null }
  | { type: 'admin_fee'; amount: string | number; invoiceId: string }
  | { type: 'adjustment'; amount: string | number; note: string; createdBy: string }

/**
 * Catat satu entri ledger dan perbarui saldo partner. Baris partner dikunci
 * (`FOR UPDATE`) supaya dua entri bersamaan tidak membaca saldo yang sama.
 * `amount` bertanda: positif menambah saldo, negatif mengurangi. Saldo boleh
 * negatif (tunggakan biaya admin).
 */
export async function postCreditEntry(
  tx: OrderTx,
  partnerId: string,
  entry: CreditEntryInput,
): Promise<{ id: string; balanceAfter: string }> {
  const partner = await tx
    .select({ creditBalance: partners.creditBalance })
    .from(partners)
    .where(eq(partners.id, partnerId))
    .for('update')
    .then((rows) => rows.at(0))
  if (!partner) throw new Error('Partner tidak ditemukan.')

  const balanceAfter = nextBalance(partner.creditBalance, entry.amount)
  const amount = nextBalance(0, entry.amount)

  const [row] = await tx
    .insert(partnerCreditLedger)
    .values({
      partnerId,
      type: entry.type,
      amount,
      balanceAfter,
      topupId: entry.type === 'topup' ? entry.topupId : null,
      invoiceId: entry.type === 'admin_fee' ? entry.invoiceId : null,
      note: entry.type === 'adjustment' ? entry.note : null,
      createdBy: entry.type === 'admin_fee' ? null : entry.createdBy,
    })
    .returning({ id: partnerCreditLedger.id })

  await tx
    .update(partners)
    .set({ creditBalance: balanceAfter, updatedAt: new Date() })
    .where(eq(partners.id, partnerId))

  return { id: row.id, balanceAfter }
}

/** Kunci baris top up yang masih `pending`, atau lempar error berpesan jelas. */
async function lockPendingTopup(tx: OrderTx, topupId: string) {
  const topup = await tx
    .select()
    .from(partnerTopups)
    .where(eq(partnerTopups.id, topupId))
    .for('update')
    .then((rows) => rows.at(0))
  if (!topup) throw new Error('Top up tidak ditemukan.')
  if (topup.status !== 'pending') {
    throw new Error(
      topup.status === 'approved'
        ? 'Top up ini sudah disetujui.'
        : 'Top up ini sudah ditolak.',
    )
  }
  return topup
}

/**
 * Admin menyetujui top up: status jadi `approved` dan saldo partner bertambah
 * lewat ledger, dalam satu transaksi. Tunggakan biaya admin (saldo minus)
 * otomatis tertutup oleh penambahan ini.
 */
export async function approvePartnerTopupTx(
  tx: OrderTx,
  input: { topupId: string; adminId: string },
): Promise<{ partnerId: string; balanceAfter: string }> {
  const topup = await lockPendingTopup(tx, input.topupId)
  const now = new Date()
  await tx
    .update(partnerTopups)
    .set({
      status: 'approved',
      reviewedBy: input.adminId,
      reviewedAt: now,
      updatedAt: now,
    })
    .where(eq(partnerTopups.id, topup.id))
  const { balanceAfter } = await postCreditEntry(tx, topup.partnerId, {
    type: 'topup',
    amount: topup.amount,
    topupId: topup.id,
    createdBy: input.adminId,
  })
  return { partnerId: topup.partnerId, balanceAfter }
}

/** Admin menolak top up (bukti tidak valid). Saldo tidak berubah. */
export async function rejectPartnerTopupTx(
  tx: OrderTx,
  input: { topupId: string; adminId: string; note: string | null },
): Promise<{ partnerId: string }> {
  const topup = await lockPendingTopup(tx, input.topupId)
  const now = new Date()
  await tx
    .update(partnerTopups)
    .set({
      status: 'rejected',
      reviewedBy: input.adminId,
      reviewedAt: now,
      reviewNote: input.note,
      updatedAt: now,
    })
    .where(eq(partnerTopups.id, topup.id))
  return { partnerId: topup.partnerId }
}

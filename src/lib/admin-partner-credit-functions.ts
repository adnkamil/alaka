import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { requireAdminUser } from './admin'
import { CREDIT_ADJUSTMENT_NOTE_MAX } from './partner-credit'

/**
 * Saldo kredit partner dari sisi admin ALAKA: verifikasi top up manual, daftar
 * saldo semua partner, koreksi saldo, dan persen biaya admin. Handler memakai
 * import dinamis supaya `db` tidak ikut ke bundle client.
 */

const idSchema = z.uuid()
const topupStatusSchema = z.enum(['pending', 'approved', 'rejected'])

export type AdminPartnerTopupRow = {
  id: string
  partnerId: string
  partnerName: string
  amount: number
  status: z.infer<typeof topupStatusSchema>
  hasProof: boolean
  reviewNote: string | null
  createdAt: Date
  reviewedAt: Date | null
}

/** Daftar top up partner per status, terbaru dulu. */
export const fetchAdminPartnerTopups = createServerFn({ method: 'GET' })
  .validator(z.object({ status: topupStatusSchema }))
  .handler(async ({ data }): Promise<Array<AdminPartnerTopupRow>> => {
    await requireAdminUser()
    const { db } = await import('../db')
    const { desc, eq } = await import('drizzle-orm')
    const { partnerTopups, partners } = await import('../db/schema')
    const rows = await db
      .select({
        id: partnerTopups.id,
        partnerId: partnerTopups.partnerId,
        partnerName: partners.name,
        amount: partnerTopups.amount,
        status: partnerTopups.status,
        hasProof: partnerTopups.paymentProofStored,
        reviewNote: partnerTopups.reviewNote,
        createdAt: partnerTopups.createdAt,
        reviewedAt: partnerTopups.reviewedAt,
      })
      .from(partnerTopups)
      .innerJoin(partners, eq(partners.id, partnerTopups.partnerId))
      .where(eq(partnerTopups.status, data.status))
      .orderBy(desc(partnerTopups.createdAt))
      .limit(200)
    return rows.map((r) => ({ ...r, amount: Number(r.amount) }))
  })

/** Setujui top up: saldo partner bertambah lewat ledger. */
export const approvePartnerTopup = createServerFn({ method: 'POST' })
  .validator(z.object({ id: idSchema }))
  .handler(async ({ data }) => {
    const admin = await requireAdminUser()
    const { db } = await import('../db')
    const { approvePartnerTopupTx } = await import('./partner-credit-queries')
    await db.transaction((tx) =>
      approvePartnerTopupTx(tx, { topupId: data.id, adminId: admin.id }),
    )
    return { ok: true as const }
  })

/** Tolak top up (bukti tidak valid). Saldo tidak berubah. */
export const rejectPartnerTopup = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      id: idSchema,
      note: z.string().trim().max(500).optional(),
    }),
  )
  .handler(async ({ data }) => {
    const admin = await requireAdminUser()
    const { db } = await import('../db')
    const { rejectPartnerTopupTx } = await import('./partner-credit-queries')
    await db.transaction((tx) =>
      rejectPartnerTopupTx(tx, {
        topupId: data.id,
        adminId: admin.id,
        note: data.note ? data.note : null,
      }),
    )
    return { ok: true as const }
  })

export type AdminPartnerCreditRow = {
  id: string
  name: string
  email: string
  balance: number
}

/** Saldo semua partner. Yang menunggak (saldo minus) di atas. */
export const fetchAdminPartnerCredits = createServerFn({ method: 'GET' }).handler(
  async (): Promise<Array<AdminPartnerCreditRow>> => {
    await requireAdminUser()
    const { db } = await import('../db')
    const { asc } = await import('drizzle-orm')
    const { partners } = await import('../db/schema')
    const rows = await db
      .select({
        id: partners.id,
        name: partners.name,
        email: partners.email,
        balance: partners.creditBalance,
      })
      .from(partners)
      .orderBy(asc(partners.creditBalance), asc(partners.name))
    return rows.map((r) => ({ ...r, balance: Number(r.balance) }))
  },
)

/**
 * Koreksi saldo manual oleh admin (± rupiah penuh, catatan wajib). Tercatat di
 * ledger sebagai `adjustment`, jadi tetap bisa diaudit.
 */
export const adjustPartnerCredit = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      partnerId: idSchema,
      amount: z
        .number()
        .int('Nominal harus rupiah penuh')
        .refine((n) => n !== 0, 'Nominal tidak boleh 0')
        .refine((n) => Math.abs(n) <= 100_000_000, 'Nominal maksimal Rp100.000.000'),
      note: z
        .string()
        .trim()
        .min(1, 'Catatan koreksi wajib diisi')
        .max(CREDIT_ADJUSTMENT_NOTE_MAX),
    }),
  )
  .handler(async ({ data }) => {
    const admin = await requireAdminUser()
    const { db } = await import('../db')
    const { postCreditEntry } = await import('./partner-credit-queries')
    const result = await db.transaction((tx) =>
      postCreditEntry(tx, data.partnerId, {
        type: 'adjustment',
        amount: data.amount,
        note: data.note,
        createdBy: admin.id,
      }),
    )
    return { balanceAfter: Number(result.balanceAfter) }
  })

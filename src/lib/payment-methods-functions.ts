import { createServerFn } from '@tanstack/react-start'
import { and, asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db'
import { paymentMethods } from '../db/schema'
import { getSessionUser } from './auth'
import { requireUserFeature } from './entitlements'

/**
 * Baca metode pembayaran TIDAK dikunci (dipakai juga di invoice/tagihan buat
 * nampilin rekening ke pelanggan), yang dikunci cuma aksi tambah/ubah/hapus/
 * aktif-nonaktif — lihat `requireUserFeature('payment_methods')` di bawah.
 */
async function requireUser() {
  const user = await getSessionUser()
  if (!user) throw new Error('Belum login')
  return user
}

const MAX_QRIS_BYTES = 1_500_000 // ~1.5MB, cukup buat gambar QR

const qrisImageSchema = z
  .string()
  .refine((v) => /^data:image\/(png|jpe?g|webp);base64,/.test(v), {
    message: 'Format gambar harus PNG, JPEG, atau WEBP',
  })
  .refine(
    (v) => {
      const base64 = v.split(',')[1] ?? ''
      // Perkiraan ukuran biner asli dari panjang string base64-nya.
      return (base64.length * 3) / 4 <= MAX_QRIS_BYTES
    },
    { message: 'Ukuran gambar maksimal 1.5MB' },
  )

/**
 * Satu skema buat bank/wallet/QRIS:
 * - bank & wallet wajib punya nomor rekening/akun
 * - QRIS wajib punya gambar
 * Provider (nama bank/e-wallet) selalu wajib.
 */
const paymentMethodInputSchema = z
  .object({
    type: z.enum(['bank', 'wallet', 'qris']),
    provider: z
      .string()
      .trim()
      .min(1, 'Nama bank/e-wallet wajib diisi')
      .max(40),
    accountNumber: z.string().trim().max(40).optional(),
    accountName: z.string().trim().max(80).optional(),
    qrisImage: qrisImageSchema.optional(),
    isActive: z.boolean().default(true),
  })
  .refine((v) => v.type !== 'qris' || Boolean(v.qrisImage), {
    path: ['qrisImage'],
    message: 'Gambar QRIS wajib diupload',
  })
  .refine((v) => v.type === 'qris' || (v.accountNumber ?? '').length >= 3, {
    path: ['accountNumber'],
    message: 'Nomor rekening/akun wajib diisi',
  })

export const listPaymentMethods = createServerFn({ method: 'GET' }).handler(
  async () => {
    const user = await requireUser()
    return (
      db
        .select()
        .from(paymentMethods)
        .where(eq(paymentMethods.userId, user.id))
        // id dipakai sebagai tiebreaker: `created_at` bisa sama persis (Postgres
        // pakai waktu mulai transaksi), biar urutan tampil tidak berubah-ubah.
        .orderBy(asc(paymentMethods.createdAt), asc(paymentMethods.id))
    )
  },
)

export const createPaymentMethod = createServerFn({ method: 'POST' })
  .validator(paymentMethodInputSchema)
  .handler(async ({ data }) => {
    // `payment_methods` termasuk fitur PRO (TRIAL & PRO terbuka).
    const { user } = await requireUserFeature('payment_methods')
    const [method] = await db
      .insert(paymentMethods)
      .values({
        userId: user.id,
        type: data.type,
        provider: data.provider,
        accountNumber: data.type === 'qris' ? null : data.accountNumber || null,
        accountName: data.type === 'qris' ? null : data.accountName || null,
        qrisImage: data.type === 'qris' ? (data.qrisImage ?? null) : null,
        isActive: data.isActive,
      })
      .returning()
    return method
  })

export const updatePaymentMethod = createServerFn({ method: 'POST' })
  .validator(paymentMethodInputSchema.extend({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const { user } = await requireUserFeature('payment_methods')
    const existing = await db.query.paymentMethods.findFirst({
      where: and(
        eq(paymentMethods.id, data.id),
        eq(paymentMethods.userId, user.id),
      ),
    })
    if (!existing) throw new Error('Metode pembayaran tidak ditemukan')

    await db
      .update(paymentMethods)
      .set({
        type: data.type,
        provider: data.provider,
        accountNumber: data.type === 'qris' ? null : data.accountNumber || null,
        accountName: data.type === 'qris' ? null : data.accountName || null,
        qrisImage: data.type === 'qris' ? (data.qrisImage ?? null) : null,
        isActive: data.isActive,
        updatedAt: new Date(),
      })
      .where(eq(paymentMethods.id, data.id))
  })

/** Toggle cepat aktif/nonaktif dari daftar di halaman Profil. */
export const setPaymentMethodActive = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.uuid(), isActive: z.boolean() }))
  .handler(async ({ data }) => {
    const { user } = await requireUserFeature('payment_methods')
    await db
      .update(paymentMethods)
      .set({ isActive: data.isActive, updatedAt: new Date() })
      .where(
        and(eq(paymentMethods.id, data.id), eq(paymentMethods.userId, user.id)),
      )
  })

export const deletePaymentMethod = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.uuid() }))
  .handler(async ({ data }) => {
    const { user } = await requireUserFeature('payment_methods')
    await db
      .delete(paymentMethods)
      .where(
        and(eq(paymentMethods.id, data.id), eq(paymentMethods.userId, user.id)),
      )
  })

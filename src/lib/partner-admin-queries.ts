import { and, eq, isNull, sql } from 'drizzle-orm'
import { db } from '../db'
import {
  calendarEvents,
  partnerInvitationTokens,
  partnerPasswordResetTokens,
  partnerProducts,
  partnerSessions,
  partners,
  users,
} from '../db/schema'
import { generateInvitationToken } from './invitation-token'
import {
  PARTNER_INVITATION_TTL_DAYS,
  PartnerError,
  isPlausiblePartnerEmail,
  normalizePartnerEmail,
} from './partner-rules'
import { toPartnerRow } from './partner-queries'
import type { PartnerRow } from './partner-queries'

/**
 * Pengelolaan partner oleh admin ALAKA (ubah data, nonaktifkan, hapus).
 * Server-only; pemanggilnya WAJIB sudah lolos `requireAdminUser()`.
 */

const DAY_MS = 24 * 60 * 60 * 1000

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  if ('code' in error && (error as { code?: unknown }).code === '23505') {
    return true
  }
  return (
    'cause' in error && isUniqueViolation((error as { cause?: unknown }).cause)
  )
}

export type AdminPartnerUpdate = {
  name: string
  email: string
  waNumber?: string | null
}

/**
 * Ubah nama / email / WhatsApp partner.
 *
 * - Nama berubah: nama lama di "brand yang dipamerkan" event partner ikut
 *   diganti (sama dengan ubah profil oleh partner sendiri).
 * - Email berubah & partner masih "Diundang": undangan lama (ke alamat lama)
 *   dihanguskan dan undangan baru dibuat — mengembalikan `inviteToken` untuk
 *   dikirim ke alamat BARU. Ini jalan keluar kalau admin salah ketik email.
 * - Email berubah & partner sudah aktif: semua sesinya dimatikan dan link atur
 *   ulang yang belum dipakai dihanguskan (email = kunci login).
 */
export async function updatePartnerByAdmin(
  id: string,
  input: AdminPartnerUpdate,
): Promise<{ partner: PartnerRow; inviteToken: string | null }> {
  const name = input.name.trim()
  const email = normalizePartnerEmail(input.email)
  const waNumber = input.waNumber?.trim() || null
  if (!name) throw new PartnerError('NAMA_KOSONG')
  if (!isPlausiblePartnerEmail(email)) {
    throw new PartnerError('EMAIL_TIDAK_VALID')
  }

  try {
    return await db.transaction(async (tx) => {
      const found = await tx
        .select()
        .from(partners)
        .where(eq(partners.id, id))
        .for('update')
      if (found.length === 0) throw new PartnerError('PARTNER_TIDAK_DITEMUKAN')
      const current = found[0]
      const emailChanged = email !== current.email

      if (emailChanged) {
        const taken = await tx
          .select({ id: users.id })
          .from(users)
          .where(sql`lower(${users.email}) = ${email}`)
          .limit(1)
        if (taken.length > 0) throw new PartnerError('EMAIL_TERDAFTAR')
      }

      const updated = await tx
        .update(partners)
        .set({ name, email, waNumber, updatedAt: new Date() })
        .where(eq(partners.id, id))
        .returning()

      if (name !== current.name) {
        await tx
          .update(calendarEvents)
          .set({
            exhibitors: sql`array_replace(${calendarEvents.exhibitors}, ${current.name}, ${name})`,
          })
          .where(eq(calendarEvents.partnerId, id))
      }

      let inviteToken: string | null = null
      if (emailChanged) {
        const now = new Date()
        if (!current.activatedAt) {
          // Masih "Diundang": hanguskan undangan ke alamat lama. Undangan baru
          // hanya dibuat kalau partner tidak sedang dinonaktifkan.
          await tx
            .update(partnerInvitationTokens)
            .set({ usedAt: now })
            .where(
              and(
                eq(partnerInvitationTokens.partnerId, id),
                isNull(partnerInvitationTokens.usedAt),
              ),
            )
          if (!current.disabledAt) {
            const { token, tokenHash } = generateInvitationToken()
            await tx.insert(partnerInvitationTokens).values({
              partnerId: id,
              tokenHash,
              expiresAt: new Date(
                now.getTime() + PARTNER_INVITATION_TTL_DAYS * DAY_MS,
              ),
            })
            inviteToken = token
          }
        } else {
          await tx
            .delete(partnerSessions)
            .where(eq(partnerSessions.partnerId, id))
          await tx
            .update(partnerPasswordResetTokens)
            .set({ usedAt: now })
            .where(
              and(
                eq(partnerPasswordResetTokens.partnerId, id),
                isNull(partnerPasswordResetTokens.usedAt),
              ),
            )
        }
      }

      return { partner: toPartnerRow(updated[0]), inviteToken }
    })
  } catch (error) {
    // Dua admin / dua partner memakai email yang sama bersamaan.
    if (isUniqueViolation(error)) throw new PartnerError('EMAIL_TERDAFTAR')
    throw error
  }
}

/**
 * Nonaktifkan / aktifkan lagi. Menonaktifkan langsung mematikan semua sesi dan
 * link atur ulang yang belum dipakai; data (produk, event, katalog) tetap utuh.
 */
export async function setPartnerDisabled(
  id: string,
  disabled: boolean,
): Promise<PartnerRow> {
  return db.transaction(async (tx) => {
    const now = new Date()
    const updated = await tx
      .update(partners)
      .set({ disabledAt: disabled ? now : null, updatedAt: now })
      .where(eq(partners.id, id))
      .returning()
    if (updated.length === 0) throw new PartnerError('PARTNER_TIDAK_DITEMUKAN')

    if (disabled) {
      await tx.delete(partnerSessions).where(eq(partnerSessions.partnerId, id))
      await tx
        .update(partnerPasswordResetTokens)
        .set({ usedAt: now })
        .where(
          and(
            eq(partnerPasswordResetTokens.partnerId, id),
            isNull(partnerPasswordResetTokens.usedAt),
          ),
        )
    }
    return toPartnerRow(updated[0])
  })
}

export type DeletedPartnerInfo = {
  /** Id produk yang ikut terhapus (untuk membersihkan foto di storage). */
  productIds: Array<string>
  hadCatalog: boolean
}

/**
 * Hapus partner PERMANEN. Produk, sesi, dan token ikut terhapus (cascade);
 * event miliknya tetap ada sebagai event admin (`partner_id` jadi kosong) supaya
 * jastiper yang sudah ikut tidak kehilangan datanya. Mengembalikan info untuk
 * membersihkan berkas di storage (dilakukan pemanggil, best-effort).
 */
export async function deletePartnerById(
  id: string,
): Promise<DeletedPartnerInfo> {
  return db.transaction(async (tx) => {
    const found = await tx
      .select({ catalog: partners.catalogPdfName })
      .from(partners)
      .where(eq(partners.id, id))
      .for('update')
    if (found.length === 0) throw new PartnerError('PARTNER_TIDAK_DITEMUKAN')

    const products = await tx
      .select({ id: partnerProducts.id })
      .from(partnerProducts)
      .where(eq(partnerProducts.partnerId, id))
    await tx.delete(partners).where(eq(partners.id, id))
    return {
      productIds: products.map((p) => p.id),
      hadCatalog: found[0].catalog !== null,
    }
  })
}

import { and, eq, gt, isNull, lt, sql } from 'drizzle-orm'
import { db } from '../db'
import {
  partnerPasswordResetTokens,
  partnerSessions,
  partners,
} from '../db/schema'
import {
  generateInvitationToken,
  hashInvitationToken,
} from './invitation-token'
import {
  MAX_PARTNER_RESET_REQUESTS_PER_WINDOW,
  PARTNER_RESET_TTL_MINUTES,
  PARTNER_RESET_WINDOW_MINUTES,
  PartnerError,
} from './partner-rules'

/**
 * Atur ulang kata sandi partner — query database. Server-only. Pola sama dengan
 * `password-reset-functions.ts` (akun jastiper): hanya hash token yang
 * disimpan, sekali pakai, masa berlaku 1 jam, dan batas permintaan per akun.
 */

const MINUTE_MS = 60 * 1000

type PartnerForReset = { id: string; activatedAt: Date | null }

/**
 * Terbitkan token atur ulang untuk partner. Mengembalikan token MENTAH (untuk
 * dikirim lewat email). Melempar `BELUM_AKTIF` kalau partner belum membuat kata
 * sandi (ia perlu undangan, bukan atur ulang) dan `TERLALU_BANYAK_PERMINTAAN`
 * kalau melewati batas per jendela waktu.
 */
export async function issuePartnerPasswordReset(
  partner: PartnerForReset,
): Promise<string> {
  if (!partner.activatedAt) throw new PartnerError('BELUM_AKTIF')

  return db.transaction(async (tx) => {
    // Kunci baris partner: dua permintaan bersamaan tidak bisa sama-sama lolos
    // hitungan batas di bawah.
    await tx
      .select({ id: partners.id })
      .from(partners)
      .where(eq(partners.id, partner.id))
      .for('update')

    const now = Date.now()
    const recent = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(partnerPasswordResetTokens)
      .where(
        and(
          eq(partnerPasswordResetTokens.partnerId, partner.id),
          gt(
            partnerPasswordResetTokens.createdAt,
            new Date(now - PARTNER_RESET_WINDOW_MINUTES * MINUTE_MS),
          ),
        ),
      )
    if (recent[0].n >= MAX_PARTNER_RESET_REQUESTS_PER_WINDOW) {
      throw new PartnerError('TERLALU_BANYAK_PERMINTAAN')
    }

    // Token lama dihanguskan, BUKAN dihapus (hitungan batas di atas bergantung
    // pada barisnya). Yang berlaku hanya token terbaru.
    await tx
      .update(partnerPasswordResetTokens)
      .set({ usedAt: new Date(now) })
      .where(
        and(
          eq(partnerPasswordResetTokens.partnerId, partner.id),
          isNull(partnerPasswordResetTokens.usedAt),
        ),
      )
    // Housekeeping: yang sudah lewat masa berlaku tidak perlu disimpan (aman
    // untuk hitungan batas karena jendelanya lebih pendek dari masa berlaku).
    await tx
      .delete(partnerPasswordResetTokens)
      .where(lt(partnerPasswordResetTokens.expiresAt, new Date(now)))

    const { token, tokenHash } = generateInvitationToken()
    await tx.insert(partnerPasswordResetTokens).values({
      partnerId: partner.id,
      tokenHash,
      expiresAt: new Date(now + PARTNER_RESET_TTL_MINUTES * MINUTE_MS),
    })
    return token
  })
}

/** Apakah token ini masih bisa dipakai? (belum dipakai, belum kedaluwarsa) */
export async function isPartnerResetTokenValid(
  rawToken: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: partnerPasswordResetTokens.id })
    .from(partnerPasswordResetTokens)
    .where(
      and(
        eq(partnerPasswordResetTokens.tokenHash, hashInvitationToken(rawToken)),
        isNull(partnerPasswordResetTokens.usedAt),
        gt(partnerPasswordResetTokens.expiresAt, new Date()),
      ),
    )
    .limit(1)
  return rows.length > 0
}

/**
 * Pakai token: simpan kata sandi baru, hanguskan token, dan matikan SEMUA sesi
 * partner yang lama (kalau akunnya sempat dibajak, sesi si pembajak ikut mati).
 * Token "diklaim" dengan UPDATE bersyarat, jadi dua permintaan bersamaan tidak
 * bisa sama-sama berhasil. Mengembalikan partner-nya.
 */
export async function completePartnerPasswordReset(
  rawToken: string,
  passwordHash: string,
) {
  return db.transaction(async (tx) => {
    const now = new Date()
    const claimed = await tx
      .update(partnerPasswordResetTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(
            partnerPasswordResetTokens.tokenHash,
            hashInvitationToken(rawToken),
          ),
          isNull(partnerPasswordResetTokens.usedAt),
          gt(partnerPasswordResetTokens.expiresAt, now),
        ),
      )
      .returning({ partnerId: partnerPasswordResetTokens.partnerId })
    if (claimed.length === 0) throw new PartnerError('LINK_RESET_TIDAK_VALID')

    const updated = await tx
      .update(partners)
      .set({
        passwordHash,
        // Berhasil membuka link yang dikirim ke emailnya = email itu miliknya.
        activatedAt: sql`coalesce(${partners.activatedAt}, now())`,
        updatedAt: now,
      })
      .where(eq(partners.id, claimed[0].partnerId))
      .returning()
    await tx
      .delete(partnerSessions)
      .where(eq(partnerSessions.partnerId, claimed[0].partnerId))
    return updated[0]
  })
}

import { and, asc, eq, gt, isNull, sql } from 'drizzle-orm'
import { db } from '../db'
import { partnerInvitationTokens, partners, users } from '../db/schema'
import {
  generateInvitationToken,
  hashInvitationToken,
} from './invitation-token'
import {
  MAX_PARTNER_INVITATIONS_PER_DAY,
  PARTNER_INVITATION_TTL_DAYS,
  PartnerError,
  isPlausiblePartnerEmail,
  normalizePartnerEmail,
  partnerStatus,
} from './partner-rules'
import type { PartnerErrorCode, PartnerStatus } from './partner-rules'

/**
 * Partner Portal — query database. Server-only (menyentuh `db`), jadi sengaja
 * `*-queries.ts`: file `*-functions.ts` hanya boleh memanggil dari DALAM
 * handler (lihat `client-bundle-safety.test.ts`).
 *
 * Akun partner terpisah dari `users`, jadi email-nya harus unik di KEDUA
 * tabel — kalau tidak, `loginUser` (yang mencari di `users` dulu) akan
 * "menyembunyikan" salah satunya. Pengecekan ada di `createPartner`, dan sisi
 * `users` di `registerUser`, callback Google, serta terima undangan admin brand
 * lewat `isPartnerEmail`.
 */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

const DAY_MS = 24 * 60 * 60 * 1000

// Drizzle membungkus error driver (`DrizzleQueryError`): kode Postgres ada di
// `cause`, bukan di error terluar. Cek keduanya.
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  if ('code' in error && (error as { code?: unknown }).code === '23505') {
    return true
  }
  return (
    'cause' in error && isUniqueViolation((error as { cause?: unknown }).cause)
  )
}

/** Apakah email ini milik partner? (dipakai untuk menolak daftar di sisi users) */
export async function isPartnerEmail(rawEmail: string): Promise<boolean> {
  const email = normalizePartnerEmail(rawEmail)
  const rows = await db
    .select({ id: partners.id })
    .from(partners)
    .where(eq(partners.email, email))
    .limit(1)
  return rows.length > 0
}

export async function findPartnerByEmail(rawEmail: string) {
  const email = normalizePartnerEmail(rawEmail)
  const rows = await db
    .select()
    .from(partners)
    .where(eq(partners.email, email))
    .limit(1)
  return rows.length > 0 ? rows[0] : null
}

export type PartnerRow = {
  id: string
  name: string
  email: string
  waNumber: string | null
  status: PartnerStatus
  activatedAt: Date | null
  createdAt: Date
}

function toPartnerRow(row: typeof partners.$inferSelect): PartnerRow {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    waNumber: row.waNumber,
    status: partnerStatus(row),
    activatedAt: row.activatedAt,
    createdAt: row.createdAt,
  }
}

/** Semua partner untuk halaman admin (terbaru di atas). */
export async function listPartners(): Promise<Array<PartnerRow>> {
  const rows = await db
    .select()
    .from(partners)
    .orderBy(sql`${partners.createdAt} desc`, asc(partners.name))
  return rows.map(toPartnerRow)
}

async function insertToken(tx: Tx, partnerId: string) {
  const { token, tokenHash } = generateInvitationToken()
  const expiresAt = new Date(Date.now() + PARTNER_INVITATION_TTL_DAYS * DAY_MS)
  await tx
    .insert(partnerInvitationTokens)
    .values({ partnerId, tokenHash, expiresAt })
  return token
}

export type CreatePartnerInput = {
  name: string
  email: string
  waNumber?: string | null
}

/**
 * Daftarkan partner baru (status "Diundang") + token undangan pertamanya.
 * Dipanggil admin ALAKA. Token mentah hanya dikembalikan di sini untuk dikirim
 * lewat email — di database hanya hash-nya.
 */
export async function createPartner(
  adminUserId: string,
  input: CreatePartnerInput,
) {
  const name = input.name.trim()
  const email = normalizePartnerEmail(input.email)
  const waNumber = input.waNumber?.trim() || null
  if (!name) throw new PartnerError('NAMA_KOSONG')
  if (!isPlausiblePartnerEmail(email))
    throw new PartnerError('EMAIL_TIDAK_VALID')

  try {
    return await db.transaction(async (tx) => {
      const existingUsers = await tx
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${email}`)
        .limit(1)
      if (existingUsers.length > 0) throw new PartnerError('EMAIL_TERDAFTAR')

      const [partner] = await tx
        .insert(partners)
        .values({ name, email, waNumber, createdBy: adminUserId })
        .returning()
      const token = await insertToken(tx, partner.id)
      return { partner: toPartnerRow(partner), token }
    })
  } catch (error) {
    // Dua admin mendaftarkan email yang sama bersamaan: salah satunya kena
    // unique index `partners_email_unique`.
    if (isUniqueViolation(error)) throw new PartnerError('EMAIL_TERDAFTAR')
    throw error
  }
}

/**
 * Kirim ulang undangan: semua token lama yang belum dipakai dihanguskan, lalu
 * dibuat token baru. Hanya untuk partner yang belum aktif. Dibatasi per
 * partner per 24 jam.
 */
export async function reissuePartnerInvitation(partnerId: string) {
  return db.transaction(async (tx) => {
    const found = await tx
      .select()
      .from(partners)
      .where(eq(partners.id, partnerId))
      .for('update')
    if (found.length === 0) throw new PartnerError('PARTNER_TIDAK_DITEMUKAN')
    const partner = found[0]
    if (partner.activatedAt) throw new PartnerError('SUDAH_AKTIF')

    const since = new Date(Date.now() - DAY_MS)
    const [recent] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(partnerInvitationTokens)
      .where(
        and(
          eq(partnerInvitationTokens.partnerId, partnerId),
          gt(partnerInvitationTokens.createdAt, since),
        ),
      )
    if (recent.n >= MAX_PARTNER_INVITATIONS_PER_DAY) {
      throw new PartnerError('TERLALU_BANYAK_UNDANGAN')
    }

    await tx
      .update(partnerInvitationTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(partnerInvitationTokens.partnerId, partnerId),
          isNull(partnerInvitationTokens.usedAt),
        ),
      )
    const token = await insertToken(tx, partnerId)
    return { partner: toPartnerRow(partner), token }
  })
}

/**
 * Batalkan partner yang BARU dibuat kalau email undangannya gagal terkirim,
 * supaya tidak tersisa partner "Diundang" yang tidak punya cara masuk. Hanya
 * menghapus partner yang belum aktif.
 */
export async function discardInactivePartner(partnerId: string) {
  await db
    .delete(partners)
    .where(and(eq(partners.id, partnerId), isNull(partners.activatedAt)))
}

export type PartnerInvitationPreview =
  | { state: 'valid'; email: string; partnerName: string }
  | { state: 'invalid'; reason: PartnerErrorCode }

async function findToken(executor: Pick<Tx, 'select'>, rawToken: string) {
  const rows = await executor
    .select({
      id: partnerInvitationTokens.id,
      partnerId: partnerInvitationTokens.partnerId,
      expiresAt: partnerInvitationTokens.expiresAt,
      usedAt: partnerInvitationTokens.usedAt,
      email: partners.email,
      name: partners.name,
      activatedAt: partners.activatedAt,
    })
    .from(partnerInvitationTokens)
    .innerJoin(partners, eq(partners.id, partnerInvitationTokens.partnerId))
    .where(eq(partnerInvitationTokens.tokenHash, hashInvitationToken(rawToken)))
    .limit(1)
  return rows.length > 0 ? rows[0] : null
}

function tokenProblem(
  row: NonNullable<Awaited<ReturnType<typeof findToken>>>,
  now: Date,
): PartnerErrorCode | null {
  if (row.usedAt || row.activatedAt) return 'UNDANGAN_SUDAH_DIPAKAI'
  if (row.expiresAt <= now) return 'UNDANGAN_KEDALUWARSA'
  return null
}

/** Data untuk halaman terima undangan (publik). */
export async function getPartnerInvitationPreview(
  rawToken: string,
): Promise<PartnerInvitationPreview> {
  const row = await findToken(db, rawToken)
  if (!row) return { state: 'invalid', reason: 'UNDANGAN_TIDAK_DITEMUKAN' }
  const problem = tokenProblem(row, new Date())
  if (problem) return { state: 'invalid', reason: problem }
  return { state: 'valid', email: row.email, partnerName: row.name }
}

/**
 * Terima undangan: set kata sandi, tandai partner aktif, hanguskan token.
 * Token ditandai terpakai dengan UPDATE bersyarat (`used_at is null`), jadi
 * dua permintaan bersamaan tidak bisa sama-sama berhasil.
 */
export async function acceptPartnerInvitation(
  rawToken: string,
  passwordHash: string,
) {
  return db.transaction(async (tx) => {
    const row = await findToken(tx, rawToken)
    if (!row) throw new PartnerError('UNDANGAN_TIDAK_DITEMUKAN')
    const now = new Date()
    const problem = tokenProblem(row, now)
    if (problem) throw new PartnerError(problem)

    const claimed = await tx
      .update(partnerInvitationTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(partnerInvitationTokens.id, row.id),
          isNull(partnerInvitationTokens.usedAt),
        ),
      )
      .returning({ id: partnerInvitationTokens.id })
    if (claimed.length === 0) throw new PartnerError('UNDANGAN_SUDAH_DIPAKAI')

    const [partner] = await tx
      .update(partners)
      .set({ passwordHash, activatedAt: now, updatedAt: now })
      .where(eq(partners.id, row.partnerId))
      .returning()
    return partner
  })
}

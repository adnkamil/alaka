import { and, asc, desc, eq, gt, lte, sql } from 'drizzle-orm'
import { db } from '../db'
import { brandInvitations, brands, users } from '../db/schema'
import { requireBrandPermission } from './brand-permissions'
import {
  generateInvitationToken,
  hashInvitationToken,
} from './invitation-token'
import {
  INVITATION_TTL_DAYS,
  TeamError,
  getMaxAdmins,
  isPlausibleEmail,
  normalizeInviteEmail,
} from './team-rules'
import type { BrandRole } from './brand-permissions'

/**
 * Tim brand (pemilik + admin): undangan, penerimaan undangan, dan pencabutan
 * admin. Server-only (menyentuh `db`), jadi sengaja `*-queries.ts`.
 *
 * Konkurensi: semua perubahan yang bergantung pada JUMLAH admin mengunci baris
 * brand-nya lebih dulu (`FOR UPDATE`), selalu dengan urutan brand -> undangan,
 * sehingga dua undangan/penerimaan yang bersamaan tidak bisa sama-sama lolos
 * batas dan tidak saling deadlock.
 */

/** Akun yang melakukan aksi (biasanya `session user`). */
export type TeamActor = { id: string; brandId: string; brandRole: BrandRole }

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

async function lockBrand(tx: Tx, brandId: string) {
  await tx
    .select({ id: brands.id })
    .from(brands)
    .where(eq(brands.id, brandId))
    .for('update')
}

async function countAdmins(tx: Tx, brandId: string) {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(users)
    .where(and(eq(users.brandId, brandId), eq(users.brandRole, 'admin')))
  return row.n
}

async function countLivePending(tx: Tx, brandId: string, now: Date) {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(brandInvitations)
    .where(
      and(
        eq(brandInvitations.brandId, brandId),
        eq(brandInvitations.status, 'pending'),
        gt(brandInvitations.expiresAt, now),
      ),
    )
  return row.n
}

async function emailAlreadyRegistered(tx: Tx, email: string) {
  const rows = await tx
    .select({ id: users.id })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1)
  return rows.length > 0
}

function isUniqueViolation(error: unknown) {
  const code = error as { code?: string; cause?: { code?: string } } | null
  return code?.code === '23505' || code?.cause?.code === '23505'
}

/** Daftar anggota & undangan yang masih berlaku, plus pemakaian slot admin. */
export async function listTeam(brandId: string) {
  const now = new Date()
  const [members, invitations] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        brandRole: users.brandRole,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.brandId, brandId))
      // owner dulu (enum owner < admin), lalu urutan bergabung
      .orderBy(asc(users.brandRole), asc(users.createdAt), asc(users.id)),
    db
      .select({
        id: brandInvitations.id,
        email: brandInvitations.email,
        role: brandInvitations.role,
        expiresAt: brandInvitations.expiresAt,
        createdAt: brandInvitations.createdAt,
      })
      .from(brandInvitations)
      .where(
        and(
          eq(brandInvitations.brandId, brandId),
          eq(brandInvitations.status, 'pending'),
          gt(brandInvitations.expiresAt, now),
        ),
      )
      .orderBy(desc(brandInvitations.createdAt)),
  ])

  const adminCount = members.filter((m) => m.brandRole === 'admin').length
  const maxAdmins = getMaxAdmins()
  return {
    members,
    invitations,
    adminCount,
    maxAdmins,
    slotsLeft: Math.max(0, maxAdmins - adminCount - invitations.length),
  }
}

/**
 * Buat undangan admin. Mengembalikan token MENTAH (untuk dikirim lewat email);
 * di database hanya hash-nya yang tersimpan.
 */
export async function createInvitation(actor: TeamActor, rawEmail: string) {
  requireBrandPermission(actor, 'team.manage')

  const email = normalizeInviteEmail(rawEmail)
  if (!isPlausibleEmail(email)) throw new TeamError('EMAIL_TIDAK_VALID')

  return db.transaction(async (tx) => {
    await lockBrand(tx, actor.brandId)
    const now = new Date()

    // Undangan pending yang sudah lewat masa berlaku dianggap expired, supaya
    // tidak menahan slot dan tidak bentrok dengan unique index "pending".
    await tx
      .update(brandInvitations)
      .set({ status: 'expired' })
      .where(
        and(
          eq(brandInvitations.brandId, actor.brandId),
          eq(brandInvitations.status, 'pending'),
          lte(brandInvitations.expiresAt, now),
        ),
      )

    if (await emailAlreadyRegistered(tx, email)) {
      throw new TeamError('EMAIL_TERDAFTAR')
    }

    const duplicate = await tx
      .select({ id: brandInvitations.id })
      .from(brandInvitations)
      .where(
        and(
          eq(brandInvitations.brandId, actor.brandId),
          eq(brandInvitations.email, email),
          eq(brandInvitations.status, 'pending'),
        ),
      )
      .limit(1)
    if (duplicate.length > 0) throw new TeamError('UNDANGAN_SUDAH_ADA')

    const used =
      (await countAdmins(tx, actor.brandId)) +
      (await countLivePending(tx, actor.brandId, now))
    if (used >= getMaxAdmins()) throw new TeamError('SLOT_PENUH')

    const { token, tokenHash } = generateInvitationToken()
    const [invitation] = await tx
      .insert(brandInvitations)
      .values({
        brandId: actor.brandId,
        email,
        tokenHash,
        invitedBy: actor.id,
        expiresAt: new Date(
          now.getTime() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000,
        ),
      })
      .returning()

    return { invitation, token }
  })
}

/** Batalkan undangan yang masih menunggu. */
export async function revokeInvitation(actor: TeamActor, invitationId: string) {
  requireBrandPermission(actor, 'team.manage')

  const revoked = await db
    .update(brandInvitations)
    .set({ status: 'revoked', revokedAt: new Date() })
    .where(
      and(
        eq(brandInvitations.id, invitationId),
        eq(brandInvitations.brandId, actor.brandId),
        eq(brandInvitations.status, 'pending'),
      ),
    )
    .returning({ id: brandInvitations.id })

  if (revoked.length === 0) throw new TeamError('UNDANGAN_TIDAK_DITEMUKAN')
}

/**
 * Cabut admin = HAPUS akunnya. Satu akun selalu terikat ke satu brand
 * (`users.brand_id` NOT NULL), jadi akun admin yang dicabut tidak punya tempat
 * lain. Sesinya ikut terhapus (cascade) sehingga langsung keluar. Data yang
 * pernah dia buat tetap milik brand; hanya penanda "dibuat oleh"
 * (`user_id`) yang jadi kosong. Emailnya bebas dipakai lagi (mendaftar atau
 * diundang).
 */
export async function removeAdmin(actor: TeamActor, adminUserId: string) {
  requireBrandPermission(actor, 'team.manage')

  await db.transaction(async (tx) => {
    await lockBrand(tx, actor.brandId)
    const removed = await tx
      .delete(users)
      .where(
        and(
          eq(users.id, adminUserId),
          eq(users.brandId, actor.brandId),
          eq(users.brandRole, 'admin'),
        ),
      )
      .returning({ id: users.id })
    if (removed.length === 0) throw new TeamError('ADMIN_TIDAK_DITEMUKAN')
  })
}

export type InvitationPreview =
  | { state: 'valid'; email: string; brandName: string | null; expiresAt: Date }
  | { state: 'invalid'; reason: TeamError['code'] }

/** Untuk halaman terima undangan: tampilkan siapa yang mengundang, atau alasan gagal. */
export async function getInvitationPreview(
  token: string,
): Promise<InvitationPreview> {
  const rows = await db
    .select({
      email: brandInvitations.email,
      status: brandInvitations.status,
      expiresAt: brandInvitations.expiresAt,
      brandName: brands.name,
    })
    .from(brandInvitations)
    .innerJoin(brands, eq(brands.id, brandInvitations.brandId))
    .where(eq(brandInvitations.tokenHash, hashInvitationToken(token)))
    .limit(1)

  const row = rows.at(0)
  if (!row) return { state: 'invalid', reason: 'UNDANGAN_TIDAK_DITEMUKAN' }
  if (row.status === 'accepted') {
    return { state: 'invalid', reason: 'UNDANGAN_SUDAH_DIPAKAI' }
  }
  if (row.status === 'revoked') {
    return { state: 'invalid', reason: 'UNDANGAN_DICABUT' }
  }
  if (row.status === 'expired' || row.expiresAt <= new Date()) {
    return { state: 'invalid', reason: 'UNDANGAN_KEDALUWARSA' }
  }
  return {
    state: 'valid',
    email: row.email,
    brandName: row.brandName,
    expiresAt: row.expiresAt,
  }
}

type AcceptingAccount = { name: string; email: string } & (
  | { passwordHash: string; googleId?: undefined }
  | { googleId: string; passwordHash?: undefined }
)

/**
 * Terima undangan: buat akun baru sebagai admin di brand pengundang (BUKAN
 * brand baru). Email akun harus sama dengan email yang diundang. Email langsung
 * ditandai terverifikasi karena tautannya hanya sampai ke kotak masuk email itu
 * (untuk jalur Google, pemanggil wajib memastikan `email_verified`).
 *
 * Satu-satunya jalur selain `createUserWithBrand` yang boleh `insert(users)`.
 */
export async function acceptInvitation(
  token: string,
  account: AcceptingAccount,
) {
  const tokenHash = hashInvitationToken(token)

  try {
    return await db.transaction(async (tx) => {
      // Urutan kunci: brand dulu, baru undangan (sama dengan createInvitation).
      const peeked = await tx
        .select({ brandId: brandInvitations.brandId })
        .from(brandInvitations)
        .where(eq(brandInvitations.tokenHash, tokenHash))
      const peek = peeked.at(0)
      if (!peek) throw new TeamError('UNDANGAN_TIDAK_DITEMUKAN')

      await lockBrand(tx, peek.brandId)

      const [invitation] = await tx
        .select()
        .from(brandInvitations)
        .where(eq(brandInvitations.tokenHash, tokenHash))
        .for('update')

      const now = new Date()
      if (invitation.status === 'accepted') {
        throw new TeamError('UNDANGAN_SUDAH_DIPAKAI')
      }
      if (invitation.status === 'revoked') {
        throw new TeamError('UNDANGAN_DICABUT')
      }
      if (invitation.status === 'expired' || invitation.expiresAt <= now) {
        throw new TeamError('UNDANGAN_KEDALUWARSA')
      }
      if (normalizeInviteEmail(account.email) !== invitation.email) {
        throw new TeamError('EMAIL_TIDAK_COCOK')
      }
      if (await emailAlreadyRegistered(tx, invitation.email)) {
        throw new TeamError('EMAIL_TERDAFTAR')
      }
      if ((await countAdmins(tx, invitation.brandId)) >= getMaxAdmins()) {
        throw new TeamError('SLOT_PENUH')
      }

      const [user] = await tx
        .insert(users)
        .values({
          name: account.name,
          email: account.email.trim(),
          passwordHash: account.passwordHash ?? null,
          googleId: account.googleId ?? null,
          emailVerifiedAt: now,
          brandId: invitation.brandId,
          brandRole: invitation.role,
        })
        .returning()

      await tx
        .update(brandInvitations)
        .set({ status: 'accepted', acceptedAt: now, acceptedBy: user.id })
        .where(eq(brandInvitations.id, invitation.id))

      return user
    })
  } catch (error) {
    // Pendaftaran biasa tidak mengunci brand, jadi email yang sama bisa lolos
    // pengecekan di atas lalu bentrok di unique index `users.email`.
    if (isUniqueViolation(error)) throw new TeamError('EMAIL_TERDAFTAR')
    throw error
  }
}

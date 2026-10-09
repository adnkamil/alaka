/**
 * Logika server-only untuk verifikasi email (token + pengiriman).
 *
 * Sengaja di file `*-queries.ts` (bukan `*-functions.ts`) karena menyentuh `db`
 * di luar handler server function; lihat `client-bundle-safety.test.ts`.
 */
import { createHash, randomBytes } from 'node:crypto'
import { and, eq, gt, isNull, lt, sql } from 'drizzle-orm'
import { db } from '../db'
import { emailVerificationTokens, users } from '../db/schema'
import { resolveAppUrl } from './app-url'
import { buildEmailVerificationMail } from './email-verification-mail'
import { sendMail } from './mailer'

const TOKEN_TTL_HOURS = 24
const TOKEN_TTL_MS = TOKEN_TTL_HOURS * 60 * 60 * 1000
// Batas kirim per akun dalam satu window — cegah spam ke email orang lain.
const RATE_WINDOW_MS = 15 * 60 * 1000
const MAX_SENDS_PER_WINDOW = 3

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export interface VerificationRecipient {
  id: string
  name: string
  email: string
  brandName: string | null
}

/**
 * Buat token baru lalu kirim email verifikasi. Melempar Error dengan pesan yang
 * aman ditampilkan ke user kalau kena rate limit atau pengiriman gagal.
 */
export async function sendVerificationEmail(user: VerificationRecipient) {
  const [recent] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(emailVerificationTokens)
    .where(
      and(
        eq(emailVerificationTokens.userId, user.id),
        gt(
          emailVerificationTokens.createdAt,
          new Date(Date.now() - RATE_WINDOW_MS),
        ),
      ),
    )
  if (recent.count >= MAX_SENDS_PER_WINDOW) {
    throw new Error(
      'Terlalu banyak permintaan. Coba lagi dalam beberapa menit.',
    )
  }

  // Token lama dihanguskan (bukan dihapus) supaya hitungan rate limit di atas
  // tidak ter-reset — sama seperti alur atur ulang kata sandi.
  await db
    .update(emailVerificationTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(emailVerificationTokens.userId, user.id),
        isNull(emailVerificationTokens.usedAt),
      ),
    )

  // Housekeeping: token yang sudah lewat masa berlaku tidak perlu disimpan.
  await db
    .delete(emailVerificationTokens)
    .where(lt(emailVerificationTokens.expiresAt, new Date()))

  const token = randomBytes(32).toString('base64url')
  const tokenHash = hashToken(token)
  await db.insert(emailVerificationTokens).values({
    userId: user.id,
    tokenHash,
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
  })

  const mail = buildEmailVerificationMail({
    name: user.name,
    brand: user.brandName?.trim() || 'ALAKA',
    verifyUrl: `${resolveAppUrl()}/verifikasi-email/${token}`,
    expiresHours: TOKEN_TTL_HOURS,
  })

  try {
    await sendMail({
      to: user.email,
      ...mail,
      idempotencyKey: `email-verification/${tokenHash}`,
    })
  } catch (err) {
    // Detail error cukup di log server; ke user cuma pesan umum.
    console.error('Gagal mengirim email verifikasi:', err)
    throw new Error('Gagal mengirim email. Coba lagi sebentar lagi.')
  }
}

export type VerifyEmailStatus = 'verified' | 'already' | 'expired' | 'invalid'

/**
 * Pakai token dari link email. Link yang diklik dua kali (atau dibuka dulu oleh
 * pemindai email) tetap menghasilkan 'already' selama emailnya sudah
 * terverifikasi, jadi user tidak melihat error palsu.
 */
export async function verifyEmailToken(
  token: string,
): Promise<VerifyEmailStatus> {
  const row = await db.query.emailVerificationTokens.findFirst({
    where: eq(emailVerificationTokens.tokenHash, hashToken(token)),
  })
  if (!row) return 'invalid'

  const user = await db.query.users.findFirst({
    where: eq(users.id, row.userId),
  })
  if (!user) return 'invalid'
  if (user.emailVerifiedAt) return 'already'

  if (row.usedAt || row.expiresAt < new Date()) return 'expired'

  const now = new Date()
  await db
    .update(emailVerificationTokens)
    .set({ usedAt: now })
    .where(eq(emailVerificationTokens.id, row.id))
  await db
    .update(users)
    .set({ emailVerifiedAt: now, updatedAt: now })
    .where(eq(users.id, user.id))

  return 'verified'
}

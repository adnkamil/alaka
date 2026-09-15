import { createHash, randomBytes } from 'node:crypto'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { and, eq, gt, isNull, lt, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '../db'
import { passwordResetTokens, users } from '../db/schema'
import { createSession, hashPassword, revokeAllSessions } from './auth'
import { sendMail } from './mailer'
import { buildPasswordResetMail } from './password-reset-mail'

const TOKEN_TTL_MS = 60 * 60 * 1000 // 1 jam
const TOKEN_TTL_MINUTES = 60
// Batas minta link per akun dalam satu window — cegah spam ke email orang lain.
const RATE_WINDOW_MS = 15 * 60 * 1000
const MAX_REQUESTS_PER_WINDOW = 3

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function findValidResetToken(token: string) {
  return db.query.passwordResetTokens.findFirst({
    where: and(
      eq(passwordResetTokens.tokenHash, hashToken(token)),
      isNull(passwordResetTokens.usedAt),
      gt(passwordResetTokens.expiresAt, new Date()),
    ),
  })
}

/**
 * Basis URL buat link di email. APP_URL dipakai kalau di-set (wajib di
 * produksi); kalau tidak, ambil origin dari request — praktis buat dev.
 */
function resolveAppUrl() {
  const configured = process.env.APP_URL?.trim()
  if (configured) return configured.replace(/\/+$/, '')
  return new URL(getRequest().url).origin
}

/**
 * Minta link atur ulang kata sandi.
 *
 * PENTING (anti-enumeration): semua cabang — email tidak terdaftar, kena rate
 * limit, sampai provider email-nya error — tetap balas `{ ok: true }` dengan
 * pesan yang sama di UI. Jadi endpoint ini nggak bisa dipakai buat menebak
 * email mana yang punya akun.
 */
export const requestPasswordReset = createServerFn({ method: 'POST' })
  .validator(z.object({ email: z.string().email('Email tidak valid') }))
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase()
    const ok = { ok: true }

    const user = await db.query.users.findFirst({
      where: sql`lower(${users.email}) = ${email}`,
    })
    if (!user) return ok

    const [recent] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.userId, user.id),
          gt(
            passwordResetTokens.createdAt,
            new Date(Date.now() - RATE_WINDOW_MS),
          ),
        ),
      )
    if (recent.count >= MAX_REQUESTS_PER_WINDOW) return ok

    // Token lama dihanguskan, BUKAN dihapus: kalau dihapus, hitungan rate limit
    // di atas ikut ter-reset (baris lama lenyap) sehingga email bisa diminta
    // tanpa batas. Dihanguskan = usedAt diisi, dan findValidResetToken() sudah
    // mengabaikan token yang usedAt-nya terisi.
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(passwordResetTokens.userId, user.id),
          isNull(passwordResetTokens.usedAt),
        ),
      )

    // Housekeeping: token yang sudah lewat masa berlaku tidak perlu disimpan.
    // Aman buat rate limit karena window-nya (15 menit) lebih pendek dari TTL.
    await db
      .delete(passwordResetTokens)
      .where(lt(passwordResetTokens.expiresAt, new Date()))

    const token = randomBytes(32).toString('base64url')
    const tokenHash = hashToken(token)
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    })

    const mail = buildPasswordResetMail({
      name: user.name,
      brand: user.brandName?.trim() || 'Jastip',
      resetUrl: `${resolveAppUrl()}/reset-sandi/${token}`,
      expiresMinutes: TOKEN_TTL_MINUTES,
    })

    try {
      await sendMail({
        to: user.email,
        ...mail,
        idempotencyKey: `password-reset/${tokenHash}`,
      })
    } catch (err) {
      // Error dikonsumsi di server: kalau diteruskan ke client, beda pesan
      // error bisa jadi bocoran soal keberadaan akun.
      console.error('Gagal mengirim email atur ulang kata sandi:', err)
    }

    return ok
  })

/** Cek token dulu sebelum formnya ditampilkan (biar link mati bisa langsung kelihatan). */
export const validateResetToken = createServerFn({ method: 'GET' })
  .validator(z.object({ token: z.string().min(1) }))
  .handler(async ({ data }) => {
    const row = await findValidResetToken(data.token)
    return { valid: Boolean(row) }
  })

/** Simpan kata sandi baru dari link email, lalu langsung login. */
export const resetPassword = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      token: z.string().min(1),
      password: z.string().min(8, 'Password minimal 8 karakter'),
    }),
  )
  .handler(async ({ data }) => {
    const row = await findValidResetToken(data.token)
    if (!row) {
      throw new Error('Link atur ulang tidak valid atau sudah kedaluwarsa')
    }

    const passwordHash = await hashPassword(data.password)
    await db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, row.userId))

    // Sekali pakai.
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, row.id))

    // Rotasi session: semua sesi lama (termasuk milik orang lain kalau akunnya
    // sempat dibajak) dimatikan, lalu user langsung dapat sesi baru di device
    // ini supaya nggak perlu login ulang.
    await revokeAllSessions(row.userId)
    await createSession(row.userId)

    return { ok: true }
  })

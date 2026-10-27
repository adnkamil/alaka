import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { hashPassword } from './auth'
import { createPartnerSession } from './partner-auth'
import {
  completePartnerPasswordReset,
  isPartnerResetTokenValid,
} from './partner-password-reset-queries'
import { PARTNER_PASSWORD_MIN_LENGTH } from './partner-rules'

/**
 * Atur ulang kata sandi partner. Titik masuknya adalah halaman `/lupa-sandi`
 * yang sama dengan jastiper (lihat `requestPasswordReset`), yang memanggil
 * `sendPartnerPasswordReset` (di `partner-password-reset-service.ts`) kalau
 * emailnya milik partner. Link di email
 * mengarah ke `/reset-sandi-partner/<token>`.
 */

const tokenSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/, 'Link atur ulang tidak valid')

/** Cek token dulu sebelum formnya ditampilkan (link mati langsung kelihatan). */
export const validatePartnerResetToken = createServerFn({ method: 'GET' })
  .validator(z.object({ token: z.string().max(256) }))
  .handler(async ({ data }) => ({
    valid: tokenSchema.safeParse(data.token).success
      ? await isPartnerResetTokenValid(data.token)
      : false,
  }))

/** Simpan kata sandi baru dari link email, lalu langsung login sebagai partner. */
export const resetPartnerPassword = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      token: tokenSchema,
      password: z
        .string()
        .min(
          PARTNER_PASSWORD_MIN_LENGTH,
          `Password minimal ${PARTNER_PASSWORD_MIN_LENGTH} karakter`,
        ),
    }),
  )
  .handler(async ({ data }) => {
    const passwordHash = await hashPassword(data.password)
    const partner = await completePartnerPasswordReset(data.token, passwordHash)
    // Semua sesi lama sudah dimatikan; buat sesi baru di perangkat ini.
    await createPartnerSession(partner.id)
    return { ok: true }
  })

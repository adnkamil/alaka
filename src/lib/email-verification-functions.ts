import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getSessionUser } from './auth'
import {
  sendVerificationEmail,
  verifyEmailToken,
} from './email-verification-queries'

/** Kirim ulang email verifikasi untuk user yang sedang login. */
export const resendVerificationEmail = createServerFn({
  method: 'POST',
}).handler(async () => {
  const user = await getSessionUser()
  if (!user) throw new Error('Belum login')
  if (user.emailVerifiedAt) return { ok: true, alreadyVerified: true }

  await sendVerificationEmail(user)
  return { ok: true, alreadyVerified: false }
})

/**
 * Pakai token dari link email. POST (bukan GET) dan dipanggil dari halaman
 * setelah dimuat, bukan saat link dibuka — supaya pemindai link di email tidak
 * menghanguskan token sebelum user sempat mengkliknya.
 */
export const verifyEmail = createServerFn({ method: 'POST' })
  .validator(z.object({ token: z.string().min(1) }))
  .handler(async ({ data }) => {
    const status = await verifyEmailToken(data.token)
    return { status }
  })

import { resolveAppUrl } from './app-url'
import { sendMail } from './mailer'
import { issuePartnerPasswordReset } from './partner-password-reset-queries'
import { PARTNER_RESET_TTL_MINUTES } from './partner-rules'
import { buildPasswordResetMail } from './password-reset-mail'

/**
 * Kirim email atur ulang kata sandi partner. Server-only; sengaja BUKAN di
 * `*-functions.ts` (file itu diimpor route di browser, dan fungsi biasa yang
 * diekspornya ikut terbawa — lihat `client-bundle-safety.test.ts`). Hanya boleh
 * dipanggil dari dalam handler server function.
 */

/**
 * Terbitkan token + kirim email. BUKAN server function: dipanggil dari dalam
 * handler `requestPasswordReset`. Melempar `PartnerError` (belum aktif / terlalu
 * banyak permintaan) atau Error umum kalau email gagal terkirim.
 */
export async function sendPartnerPasswordReset(partner: {
  id: string
  name: string
  email: string
  activatedAt: Date | null
  disabledAt?: Date | null
}): Promise<void> {
  const token = await issuePartnerPasswordReset(partner)

  const mail = buildPasswordResetMail({
    name: partner.name,
    brand: 'ALAKA Partner',
    resetUrl: `${resolveAppUrl()}/reset-sandi-partner/${token}`,
    expiresMinutes: PARTNER_RESET_TTL_MINUTES,
  })
  try {
    await sendMail({
      to: partner.email,
      ...mail,
      idempotencyKey: `partner-password-reset/${token.slice(0, 16)}`,
    })
  } catch (err) {
    // Detail error cukup di log server; ke partner cuma pesan umum.
    console.error('Gagal mengirim email atur ulang kata sandi partner:', err)
    throw new Error('Gagal mengirim email. Coba lagi sebentar lagi.')
  }
}

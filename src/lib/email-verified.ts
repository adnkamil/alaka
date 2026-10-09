/**
 * Pembatasan fitur untuk akun yang emailnya BELUM terverifikasi.
 *
 * Ini terpisah dari entitlement PRO (`entitlements.ts`): verifikasi email
 * soal "akun ini terpercaya", PRO soal paket. Fitur PRO tetap perlu keduanya —
 * panggil `requireVerifiedEmail()` dulu, baru cek fitur PRO-nya.
 *
 * Yang dikunci (lihat pemakaiannya):
 *   - ajukan upgrade PRO + bukti bayar  (`subscription-functions.ts`)
 *   - upload file: foto brand, gambar QRIS (`avatar-functions.ts`,
 *     `payment-methods-functions.ts`)
 *   - invoice publik `/tagihan/...`      (`orders-functions.ts`)
 *   - ganti kata sandi                   (`auth-functions.ts`)
 *
 * File ini sengaja bebas dependency (tanpa `db` dsb.) supaya aman di-import
 * dari client juga.
 */

export const EMAIL_NOT_VERIFIED_MESSAGE =
  'Verifikasi email kamu dulu untuk memakai fitur ini. Cek inbox (dan folder spam) atau kirim ulang email verifikasi dari banner di atas.'

/** Dilempar waktu fitur terkunci karena email belum diverifikasi. */
export class EmailNotVerifiedError extends Error {
  readonly code = 'EMAIL_NOT_VERIFIED'

  constructor(message: string = EMAIL_NOT_VERIFIED_MESSAGE) {
    super(message)
    this.name = 'EmailNotVerifiedError'
  }
}

export function isEmailVerified(user: {
  emailVerifiedAt: Date | null
}): boolean {
  return user.emailVerifiedAt !== null
}

/** Throw `EmailNotVerifiedError` kalau email user belum terverifikasi. */
export function requireVerifiedEmail(user: {
  emailVerifiedAt: Date | null
}): void {
  if (!isEmailVerified(user)) throw new EmailNotVerifiedError()
}

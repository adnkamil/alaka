import { createHash } from 'node:crypto'

/**
 * Kolom `sessions.token` / `partner_sessions.token` menyimpan HASH token, bukan
 * token mentahnya (yang hanya ada di cookie user). Polanya sama dengan token
 * verifikasi email & reset sandi: kalau DB bocor, isinya tidak bisa dipakai
 * sebagai cookie login.
 *
 * Token sesi berupa UUID acak (122 bit entropi), jadi SHA-256 polos sudah cukup
 * — tidak perlu salt atau hash lambat seperti untuk password.
 */
export function hashSessionToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

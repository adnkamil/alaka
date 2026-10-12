import { createHash, randomBytes } from 'node:crypto'

/**
 * Token undangan: 32 byte acak (base64url) yang dikirim lewat email. Yang
 * disimpan di database hanya hash sha256-nya — sama dengan reset sandi dan
 * verifikasi email — jadi kebocoran database tidak membocorkan tautan yang
 * masih berlaku.
 */

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function generateInvitationToken() {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: hashInvitationToken(token) }
}

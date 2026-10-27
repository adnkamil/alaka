/**
 * Aturan Partner Portal — murni, tanpa `db`, aman diimpor dari mana saja (UI
 * maupun server). Pola sama dengan `team-rules.ts`.
 */

/** Masa berlaku undangan partner. */
export const PARTNER_INVITATION_TTL_DAYS = 7

/**
 * Batas kirim/kirim-ulang undangan per partner per 24 jam. Mencegah tombol
 * "Kirim ulang" dipakai untuk membanjiri satu alamat email.
 */
export const MAX_PARTNER_INVITATIONS_PER_DAY = 5

export const PARTNER_PASSWORD_MIN_LENGTH = 8

/** Atur ulang kata sandi: link berlaku 1 jam, sama dengan akun jastiper. */
export const PARTNER_RESET_TTL_MINUTES = 60
/** Batas minta link per partner per jendela waktu — cegah spam ke email orang. */
export const PARTNER_RESET_WINDOW_MINUTES = 15
export const MAX_PARTNER_RESET_REQUESTS_PER_WINDOW = 3

export const PARTNER_SESSION_COOKIE_NAME = 'alaka_partner_session'

/** Email partner disimpan huruf kecil; pembandingan juga huruf kecil. */
export function normalizePartnerEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

export function isPlausiblePartnerEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/** "Diundang" = belum membuat kata sandi; "Aktif" = sudah. */
export type PartnerStatus = 'aktif' | 'diundang'

export function partnerStatus(partner: {
  activatedAt: Date | string | null
}): PartnerStatus {
  return partner.activatedAt ? 'aktif' : 'diundang'
}

export type PartnerErrorCode =
  | 'NAMA_KOSONG'
  | 'EMAIL_TIDAK_VALID'
  | 'EMAIL_TERDAFTAR'
  | 'PARTNER_TIDAK_DITEMUKAN'
  | 'SUDAH_AKTIF'
  | 'TERLALU_BANYAK_UNDANGAN'
  | 'UNDANGAN_TIDAK_DITEMUKAN'
  | 'UNDANGAN_KEDALUWARSA'
  | 'UNDANGAN_SUDAH_DIPAKAI'
  | 'BELUM_AKTIF'
  | 'TERLALU_BANYAK_PERMINTAAN'
  | 'LINK_RESET_TIDAK_VALID'

const PARTNER_ERROR_MESSAGES: Record<PartnerErrorCode, string> = {
  NAMA_KOSONG: 'Nama partner wajib diisi.',
  EMAIL_TIDAK_VALID: 'Email tidak valid.',
  EMAIL_TERDAFTAR: 'Email ini sudah punya akun di ALAKA.',
  PARTNER_TIDAK_DITEMUKAN: 'Partner tidak ditemukan.',
  SUDAH_AKTIF:
    'Partner ini sudah membuat kata sandi, jadi undangan tidak perlu dikirim ulang.',
  TERLALU_BANYAK_UNDANGAN:
    'Terlalu banyak undangan untuk partner ini dalam 24 jam terakhir. Coba lagi besok.',
  UNDANGAN_TIDAK_DITEMUKAN: 'Undangan tidak ditemukan.',
  UNDANGAN_KEDALUWARSA:
    'Undangan ini sudah kedaluwarsa. Minta admin ALAKA mengirim ulang.',
  UNDANGAN_SUDAH_DIPAKAI: 'Undangan ini sudah dipakai. Silakan masuk.',
  BELUM_AKTIF:
    'Akun partner ini belum diaktifkan. Buka link undangan di emailmu, atau minta admin ALAKA mengirim ulang undangan.',
  TERLALU_BANYAK_PERMINTAAN:
    'Terlalu banyak permintaan. Coba lagi dalam beberapa menit.',
  LINK_RESET_TIDAK_VALID: 'Link atur ulang tidak valid atau sudah kedaluwarsa',
}

export class PartnerError extends Error {
  readonly code: PartnerErrorCode
  constructor(code: PartnerErrorCode) {
    super(PARTNER_ERROR_MESSAGES[code])
    this.name = 'PartnerError'
    this.code = code
  }
}

export function partnerErrorMessage(code: PartnerErrorCode): string {
  return PARTNER_ERROR_MESSAGES[code]
}

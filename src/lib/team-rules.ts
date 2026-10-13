/**
 * Aturan tim brand (pemilik + admin) — murni, tanpa `db`, aman diimpor dari
 * mana saja (UI maupun server).
 */

/**
 * Batas jumlah admin per brand SAAT INI. Sengaja hanya aturan di kode, bukan di
 * skema database, supaya menaikkannya (atau membuatnya bergantung paket
 * Free/PRO) cukup mengubah fungsi ini.
 */
export const MAX_ADMINS_PER_BRAND = 1

export function getMaxAdmins(): number {
  return MAX_ADMINS_PER_BRAND
}

/** Masa berlaku undangan. */
export const INVITATION_TTL_DAYS = 7

/**
 * Batas undangan yang boleh dibuat satu brand per 24 jam (semua status dihitung,
 * termasuk yang dibatalkan). Mencegah "batalkan lalu undang ulang" dipakai untuk
 * mengirim email ke banyak alamat orang lain.
 */
export const MAX_INVITATIONS_PER_DAY = 5

/** Email undangan disimpan huruf kecil; pembandingan juga huruf kecil. */
export function normalizeInviteEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

export function isPlausibleEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export type TeamErrorCode =
  | 'EMAIL_TIDAK_VALID'
  | 'EMAIL_TERDAFTAR'
  | 'UNDANGAN_SUDAH_ADA'
  | 'SLOT_PENUH'
  | 'TERLALU_BANYAK_UNDANGAN'
  | 'UNDANGAN_TIDAK_DITEMUKAN'
  | 'UNDANGAN_KEDALUWARSA'
  | 'UNDANGAN_DICABUT'
  | 'UNDANGAN_SUDAH_DIPAKAI'
  | 'EMAIL_TIDAK_COCOK'
  | 'ADMIN_TIDAK_DITEMUKAN'

const TEAM_ERROR_MESSAGES: Record<TeamErrorCode, string> = {
  EMAIL_TIDAK_VALID: 'Email tidak valid.',
  EMAIL_TERDAFTAR:
    'Email ini sudah punya akun. Undangan hanya bisa dikirim ke email yang belum terdaftar.',
  UNDANGAN_SUDAH_ADA: 'Email ini sudah diundang dan undangannya masih berlaku.',
  SLOT_PENUH:
    'Jumlah admin sudah mencapai batas. Cabut admin atau batalkan undangan yang menunggu dulu.',
  TERLALU_BANYAK_UNDANGAN:
    'Terlalu banyak undangan dalam 24 jam terakhir. Coba lagi besok.',
  UNDANGAN_TIDAK_DITEMUKAN: 'Undangan tidak ditemukan.',
  UNDANGAN_KEDALUWARSA: 'Undangan ini sudah kedaluwarsa. Minta diundang ulang.',
  UNDANGAN_DICABUT: 'Undangan ini sudah dibatalkan oleh pemilik brand.',
  UNDANGAN_SUDAH_DIPAKAI: 'Undangan ini sudah dipakai.',
  EMAIL_TIDAK_COCOK: 'Email harus sama dengan email yang diundang.',
  ADMIN_TIDAK_DITEMUKAN: 'Admin tidak ditemukan.',
}

export function isTeamErrorCode(value: string): value is TeamErrorCode {
  return Object.prototype.hasOwnProperty.call(TEAM_ERROR_MESSAGES, value)
}

export function teamErrorMessage(code: TeamErrorCode): string {
  return TEAM_ERROR_MESSAGES[code]
}

export class TeamError extends Error {
  readonly code: TeamErrorCode

  constructor(code: TeamErrorCode) {
    super(TEAM_ERROR_MESSAGES[code])
    this.name = 'TeamError'
    this.code = code
  }
}

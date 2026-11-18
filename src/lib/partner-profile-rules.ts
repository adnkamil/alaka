import { isValidIndonesianPhone, toLocalPhoneNumber } from './format'

/**
 * Aturan profil partner — murni, tanpa `db`, dipakai UI dan server.
 */

export const PARTNER_NAME_MAX = 120

export const BANK_NAME_MAX = 40
export const BANK_ACCOUNT_NAME_MAX = 100
export const BANK_ACCOUNT_NUMBER_MIN = 5
export const BANK_ACCOUNT_NUMBER_MAX = 25

export type PartnerBankAccountInput = {
  bankName: string
  bankAccountNumber: string
  bankAccountName: string
}

export type PartnerBankAccountResult =
  | {
      ok: true
      value: {
        bankName: string | null
        bankAccountNumber: string | null
        bankAccountName: string | null
      }
    }
  | { ok: false; error: string }

/**
 * Rekening tujuan pembayaran: kosong semua = dihapus. Kalau salah satu diisi,
 * bank, nomor, dan atas nama wajib lengkap. Nomor hanya angka (spasi dan tanda
 * hubung dibuang), 5 sampai 25 digit.
 */
export function normalizePartnerBankAccount(
  input: PartnerBankAccountInput,
): PartnerBankAccountResult {
  const bankName = input.bankName.trim()
  const accountName = input.bankAccountName.trim()
  const rawNumber = input.bankAccountNumber.trim()
  if (!bankName && !accountName && !rawNumber) {
    return {
      ok: true,
      value: { bankName: null, bankAccountNumber: null, bankAccountName: null },
    }
  }
  if (!bankName) return { ok: false, error: 'Nama bank wajib diisi' }
  if (!rawNumber) return { ok: false, error: 'Nomor rekening wajib diisi' }
  if (!accountName) return { ok: false, error: 'Nama pemilik rekening wajib diisi' }
  if (bankName.length > BANK_NAME_MAX) {
    return { ok: false, error: `Nama bank maksimal ${BANK_NAME_MAX} karakter` }
  }
  if (accountName.length > BANK_ACCOUNT_NAME_MAX) {
    return {
      ok: false,
      error: `Nama pemilik rekening maksimal ${BANK_ACCOUNT_NAME_MAX} karakter`,
    }
  }
  if (!/^[\d\s-]+$/.test(rawNumber)) {
    return { ok: false, error: 'Nomor rekening hanya boleh berisi angka' }
  }
  const number = rawNumber.replace(/[\s-]/g, '')
  if (
    number.length < BANK_ACCOUNT_NUMBER_MIN ||
    number.length > BANK_ACCOUNT_NUMBER_MAX
  ) {
    return {
      ok: false,
      error: `Nomor rekening ${BANK_ACCOUNT_NUMBER_MIN} sampai ${BANK_ACCOUNT_NUMBER_MAX} digit`,
    }
  }
  return {
    ok: true,
    value: {
      bankName,
      bankAccountNumber: number,
      bankAccountName: accountName,
    },
  }
}

export type PartnerProfileInput = { name: string; waNumber: string }

export type PartnerProfileResult =
  | { ok: true; value: { name: string; waNumber: string | null } }
  | { ok: false; error: string }

/**
 * Rapikan & validasi isian profil: nama wajib (maks 120), nomor WhatsApp
 * opsional — kosong berarti dihapus, selain itu harus nomor Indonesia yang valid
 * dan disimpan dalam format lokal (08xxx).
 */
export function normalizePartnerProfile(
  input: PartnerProfileInput,
): PartnerProfileResult {
  const name = input.name.trim()
  if (!name) return { ok: false, error: 'Nama partner wajib diisi' }
  if (name.length > PARTNER_NAME_MAX) {
    return {
      ok: false,
      error: `Nama partner maksimal ${PARTNER_NAME_MAX} karakter`,
    }
  }

  const wa = input.waNumber.trim()
  if (!wa) return { ok: true, value: { name, waNumber: null } }
  if (!isValidIndonesianPhone(wa)) {
    return { ok: false, error: 'Nomor WhatsApp tidak valid' }
  }
  return { ok: true, value: { name, waNumber: toLocalPhoneNumber(wa) } }
}

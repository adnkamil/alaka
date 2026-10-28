import { isValidIndonesianPhone, toLocalPhoneNumber } from './format'

/**
 * Aturan profil partner — murni, tanpa `db`, dipakai UI dan server.
 */

export const PARTNER_NAME_MAX = 120

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

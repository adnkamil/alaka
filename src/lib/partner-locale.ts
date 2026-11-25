/**
 * Bahasa tampilan Partner Portal. Aturan murni (tanpa server/DOM) supaya bisa
 * dipakai di server function, komponen, dan test.
 *
 * Pilihan disimpan di cookie (bukan localStorage) supaya SSR langsung
 * merender bahasa yang benar — tidak ada kedipan Inggris → Indonesia.
 */

export const PARTNER_LOCALES = ['en', 'id'] as const
export type PartnerLocale = (typeof PARTNER_LOCALES)[number]

/** Default untuk partner yang belum pernah memilih: Inggris. */
export const DEFAULT_PARTNER_LOCALE: PartnerLocale = 'en'

export const PARTNER_LOCALE_COOKIE_NAME = 'alaka_partner_lang'

/** Nama bahasa ditulis dalam bahasanya sendiri, untuk pemilih bahasa. */
export const PARTNER_LOCALE_LABELS: Record<PartnerLocale, string> = {
  en: 'English',
  id: 'Bahasa Indonesia',
}

/** Tag BCP 47 untuk `Intl` / `toLocale*String` (tanggal, angka). */
export const PARTNER_INTL_LOCALE: Record<PartnerLocale, string> = {
  en: 'en-GB',
  id: 'id-ID',
}

export function isPartnerLocale(value: unknown): value is PartnerLocale {
  return (
    typeof value === 'string' &&
    (PARTNER_LOCALES as ReadonlyArray<string>).includes(value)
  )
}

/** Nilai cookie apa pun (kosong / rusak) jatuh ke default. */
export function parsePartnerLocale(value: unknown): PartnerLocale {
  return isPartnerLocale(value) ? value : DEFAULT_PARTNER_LOCALE
}

/** Halaman Partner Portal (`/partner` dan turunannya). */
export function isPartnerPortalPath(pathname: string): boolean {
  return pathname === '/partner' || pathname.startsWith('/partner/')
}

/** Bahasa partner dari string `document.cookie` / header `Cookie`. */
export function partnerLocaleFromCookie(cookie: string): PartnerLocale {
  for (const part of cookie.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name === PARTNER_LOCALE_COOKIE_NAME) {
      return parsePartnerLocale(decodeURIComponent(rest.join('=')))
    }
  }
  return DEFAULT_PARTNER_LOCALE
}

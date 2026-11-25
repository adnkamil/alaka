import { createContext, useContext, useEffect, useMemo } from 'react'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { formatDateRange } from '../lib/calendar'
import { getErrorMessage } from '../lib/error-message'
import { formatDate, formatDateTime } from '../lib/format'
import { translatePartnerMessage } from '../lib/i18n/partner/server-errors'
import { partnerDictionaries } from '../lib/i18n/partner'
import type { PartnerDict } from '../lib/i18n/partner'
import { PARTNER_INTL_LOCALE } from '../lib/partner-locale'
import type { PartnerLocale } from '../lib/partner-locale'
import { savePartnerLocale } from '../lib/partner-locale-functions'
import { partnerLocaleQuery } from '../lib/queries'
import { UiTextContext } from './ui/ui-text'

interface PartnerI18nValue {
  locale: PartnerLocale
  /** Tag `Intl` untuk bahasa aktif, mis. "en-GB". */
  intlLocale: string
  /** Kamus bahasa aktif: `t.shell.nav.dashboard`, `t.common.pcs(3)`. */
  t: PartnerDict
  setLocale: (locale: PartnerLocale) => Promise<void>
  formatDate: (date: Date | string | null | undefined) => string
  formatDateTime: (date: Date | string | null | undefined) => string
  /** Rentang tanggal event `YYYY-MM-DD`, mis. "12 – 14 Aug 2026". */
  formatDateRange: (start: string, end: string | null) => string
  /** Terjemahkan pesan error berbahasa Indonesia (server/validasi). */
  translateError: (message: string) => string
  /** `getErrorMessage` + terjemahan; untuk error yang dilempar di browser. */
  errorMessage: (err: unknown, fallback: string) => string
}

const PartnerI18nContext = createContext<PartnerI18nValue | null>(null)

/**
 * Bahasa Partner Portal. Dipasang sekali di layout `/partner`; bahasanya
 * dibaca dari cookie lewat `partnerLocaleQuery` (sudah di-prefetch di
 * `beforeLoad`, jadi tidak suspend).
 */
export function PartnerI18nProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const { data: locale } = useSuspenseQuery(partnerLocaleQuery)
  const queryClient = useQueryClient()

  // `<html lang>` milik app (Indonesia); di portal partner ikut bahasa aktif,
  // dan dikembalikan saat keluar dari portal.
  useEffect(() => {
    const root = document.documentElement
    const previous = root.lang
    root.lang = locale
    return () => {
      root.lang = previous
    }
  }, [locale])

  const value = useMemo<PartnerI18nValue>(() => {
    const intlLocale = PARTNER_INTL_LOCALE[locale]
    return {
      locale,
      intlLocale,
      t: partnerDictionaries[locale],
      setLocale: async (next) => {
        await savePartnerLocale({ data: { locale: next } })
        queryClient.setQueryData(partnerLocaleQuery.queryKey, next)
      },
      formatDate: (date) => formatDate(date, intlLocale),
      formatDateTime: (date) => formatDateTime(date, intlLocale),
      formatDateRange: (start, end) => formatDateRange(start, end, intlLocale),
      translateError: (message) => translatePartnerMessage(message, locale),
      errorMessage: (err, fallback) =>
        translatePartnerMessage(getErrorMessage(err, fallback), locale),
    }
  }, [locale, queryClient])

  return (
    <PartnerI18nContext.Provider value={value}>
      <UiTextContext.Provider value={value.t.ui}>
        {children}
      </UiTextContext.Provider>
    </PartnerI18nContext.Provider>
  )
}

export function usePartnerI18n() {
  const value = useContext(PartnerI18nContext)
  if (!value) {
    throw new Error('usePartnerI18n harus dipakai di dalam PartnerI18nProvider')
  }
  return value
}

/** Singkatan untuk komponen yang cuma butuh kamus. */
export function usePartnerT() {
  return usePartnerI18n().t
}

const INDONESIAN_FALLBACK: Pick<
  PartnerI18nValue,
  'locale' | 'intlLocale' | 't'
> = {
  locale: 'id',
  intlLocale: PARTNER_INTL_LOCALE.id,
  t: partnerDictionaries.id,
}

/**
 * Untuk komponen yang dipakai di Partner Portal DAN di bagian lain app (mis.
 * badge status tagihan). Di dalam portal ikut bahasa partner; di luar portal
 * memakai kamus Indonesia, yang isinya sama dengan teks aslinya.
 */
export function useOptionalPartnerI18n() {
  return useContext(PartnerI18nContext) ?? INDONESIAN_FALLBACK
}

import { createServerFn } from '@tanstack/react-start'
import { getCookie, setCookie } from '@tanstack/react-start/server'
import { z } from 'zod'
import {
  PARTNER_LOCALES,
  PARTNER_LOCALE_COOKIE_NAME,
  parsePartnerLocale,
} from './partner-locale'

/**
 * Bahasa Partner Portal cuma preferensi tampilan, bukan data partner, jadi
 * tidak butuh sesi: cukup cookie. Dibaca saat SSR lewat `partnerLocaleQuery`.
 */

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60

export const fetchPartnerLocale = createServerFn({ method: 'GET' }).handler(
  () => parsePartnerLocale(getCookie(PARTNER_LOCALE_COOKIE_NAME)),
)

export const savePartnerLocale = createServerFn({ method: 'POST' })
  .validator(z.object({ locale: z.enum(PARTNER_LOCALES) }))
  .handler(({ data }) => {
    setCookie(PARTNER_LOCALE_COOKIE_NAME, data.locale, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: ONE_YEAR_SECONDS,
    })
    return data.locale
  })

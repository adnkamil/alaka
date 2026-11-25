import { createMiddleware, createStart } from '@tanstack/react-start'
import { translatePartnerMessage } from './lib/i18n/partner/server-errors'
import {
  isPartnerPortalPath,
  partnerLocaleFromCookie,
} from './lib/partner-locale'

/**
 * Pesan error server function berbahasa Indonesia. Di Partner Portal yang
 * memakai bahasa Inggris, pesannya diterjemahkan di sini (sisi browser),
 * satu titik untuk semua server function. Halaman jastiper/admin dan render
 * server (SSR) tidak tersentuh.
 */
const partnerErrorLocale = createMiddleware({ type: 'function' }).client(
  async ({ next }) => {
    try {
      return await next()
    } catch (err) {
      if (
        err instanceof Error &&
        typeof document !== 'undefined' &&
        isPartnerPortalPath(window.location.pathname)
      ) {
        const locale = partnerLocaleFromCookie(document.cookie)
        err.message = translatePartnerMessage(err.message, locale)
      }
      throw err
    }
  },
)

export const startInstance = createStart(() => ({
  functionMiddleware: [partnerErrorLocale],
}))

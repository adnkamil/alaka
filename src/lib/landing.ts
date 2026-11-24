/**
 * Kapan `/` menampilkan landing page publik, bukan dashboard / redirect login.
 *
 * Murni (tanpa `db`) supaya bisa dites dan dipakai guard `_app` di server
 * maupun client.
 *
 * - Sudah login → tidak pernah landing (dashboard seperti biasa).
 * - Belum login di `/` dari browser / link → landing.
 * - Belum login di `/` dari ikon PWA terinstal (`?source=pwa`, lihat
 *   `start_url` di `vite.config.ts`) → tidak landing; guard mengarahkan ke
 *   `/login`, karena user yang sudah install tidak perlu dibujuk lagi.
 * - Belum login di path lain → tidak landing (guard mengarahkan ke `/login`).
 */

/** Nilai `?source=` yang dipasang manifest PWA di `start_url`. */
export const PWA_SOURCE = 'pwa'

export function shouldShowLanding(input: {
  isLoggedIn: boolean
  pathname: string
  search: Record<string, unknown>
}): boolean {
  if (input.isLoggedIn) return false
  if (input.pathname !== '/') return false
  return input.search.source !== PWA_SOURCE
}

/**
 * Aturan pembatasan percobaan login (murni, tanpa DB — query-nya di
 * `login-throttle-queries.ts`).
 *
 * Yang dihitung hanya percobaan GAGAL dalam jendela `LOGIN_WINDOW_MS`:
 * - per email: cegah tebak-tebak kata sandi satu akun,
 * - per IP: cegah satu sumber mencoba banyak akun sekaligus.
 */

export const LOGIN_WINDOW_MS = 15 * 60 * 1000
export const MAX_FAILED_PER_EMAIL = 5
// Lebih longgar dari per email karena satu IP bisa dipakai bareng (wifi kantor,
// operator seluler dengan CGNAT).
export const MAX_FAILED_PER_IP = 30

export const LOGIN_THROTTLED_MESSAGE =
  'Terlalu banyak percobaan masuk. Coba lagi dalam beberapa menit.'

export function emailThrottleKey(email: string) {
  return `email:${email.trim().toLowerCase()}`
}

export function ipThrottleKey(ip: string) {
  return `ip:${ip}`
}

/** Kunci yang dicek/dicatat untuk satu percobaan login (IP boleh tidak ada). */
export function loginThrottleKeys(email: string, ip: string | null) {
  const keys = [emailThrottleKey(email)]
  if (ip) keys.push(ipThrottleKey(ip))
  return keys
}

export function limitForKey(key: string) {
  return key.startsWith('ip:') ? MAX_FAILED_PER_IP : MAX_FAILED_PER_EMAIL
}

/** True kalau salah satu kunci sudah mencapai batasnya. */
export function isLoginThrottled(counts: Record<string, number>) {
  return Object.entries(counts).some(
    ([key, count]) => count >= limitForKey(key),
  )
}

/**
 * IP klien dari header request. `x-nf-client-connection-ip` diisi Netlify
 * sendiri (tidak bisa dipalsukan klien); `x-forwarded-for` hanya cadangan untuk
 * dev/hosting lain, dan hanya entri pertamanya yang dipakai.
 */
export function pickClientIp(
  getHeader: (name: string) => string | null | undefined,
) {
  const netlify = getHeader('x-nf-client-connection-ip')?.trim()
  if (netlify) return netlify
  const forwarded = getHeader('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || null
}

/**
 * Pencatatan & pengecekan percobaan login gagal (server-only, menyentuh `db`).
 * Aturannya ada di `login-throttle.ts`. Sengaja di file `*-queries.ts`; lihat
 * `client-bundle-safety.test.ts`.
 */
import { getRequestHeader } from '@tanstack/react-start/server'
import { and, eq, gt, inArray, lt, sql } from 'drizzle-orm'
import { db } from '../db'
import { loginAttempts } from '../db/schema'
import {
  LOGIN_THROTTLED_MESSAGE,
  LOGIN_WINDOW_MS,
  emailThrottleKey,
  isLoginThrottled,
  loginThrottleKeys,
  pickClientIp,
} from './login-throttle'

/** IP klien request yang sedang diproses (hanya di dalam server function). */
export function getClientIp() {
  return pickClientIp((name) => getRequestHeader(name))
}

/** Lempar error kalau email atau IP sudah terlalu sering gagal login. */
export async function assertLoginAllowed(email: string, ip: string | null) {
  const keys = loginThrottleKeys(email, ip)
  const rows = await db
    .select({
      key: loginAttempts.key,
      count: sql<number>`count(*)::int`,
    })
    .from(loginAttempts)
    .where(
      and(
        inArray(loginAttempts.key, keys),
        gt(loginAttempts.createdAt, new Date(Date.now() - LOGIN_WINDOW_MS)),
      ),
    )
    .groupBy(loginAttempts.key)

  const counts = Object.fromEntries(rows.map((row) => [row.key, row.count]))
  if (isLoginThrottled(counts)) throw new Error(LOGIN_THROTTLED_MESSAGE)
}

export async function recordLoginFailure(email: string, ip: string | null) {
  await db
    .insert(loginAttempts)
    .values(loginThrottleKeys(email, ip).map((key) => ({ key })))

  // Housekeeping: catatan di luar jendela tidak berguna lagi.
  await db
    .delete(loginAttempts)
    .where(lt(loginAttempts.createdAt, new Date(Date.now() - LOGIN_WINDOW_MS)))
    .catch(() => {})
}

/** Login berhasil -> hitungan gagal untuk email itu dimulai dari nol lagi. */
export async function clearLoginFailures(email: string) {
  await db
    .delete(loginAttempts)
    .where(eq(loginAttempts.key, emailThrottleKey(email)))
}

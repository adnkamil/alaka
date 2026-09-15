import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import {
  deleteCookie,
  getCookie,
  setCookie,
} from '@tanstack/react-start/server'
import { db } from '../db'
import { sessions, users } from '../db/schema'

export const SESSION_COOKIE_NAME = 'jastip_session'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash)
}

// Only inserts the session row and returns the token — doesn't touch cookies.
// Used by raw API route handlers (e.g. Google OAuth callback) that build the
// Set-Cookie header themselves via the Response object.
export async function createSessionToken(userId: string) {
  const token = randomUUID()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await db.insert(sessions).values({ userId, token, expiresAt })
  return { token, expiresAt }
}

export async function createSession(userId: string) {
  const { token, expiresAt } = await createSessionToken(userId)

  setCookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  })

  return token
}

export async function getSessionUser() {
  const token = getCookie(SESSION_COOKIE_NAME)
  if (!token) return null

  const rows = await db
    .select({ user: users, session: sessions })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.token, token))
    .limit(1)

  if (rows.length === 0) return null
  const row = rows[0]
  if (row.session.expiresAt < new Date()) return null

  return row.user
}

// Matikan SEMUA sesi milik user. Dipakai setelah reset/ganti kata sandi:
// device lain yang masih login otomatis ter-logout. Session yang baru
// (device ini) diterbitkan setelah fungsi ini dipanggil.
export async function revokeAllSessions(userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId))
}

export async function destroySession() {
  const token = getCookie(SESSION_COOKIE_NAME)
  if (token) {
    await db.delete(sessions).where(eq(sessions.token, token))
  }
  deleteCookie(SESSION_COOKIE_NAME, { path: '/' })
}

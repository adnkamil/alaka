import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import {
  deleteCookie,
  getCookie,
  setCookie,
} from '@tanstack/react-start/server'
import { db } from '../db'
import { partnerSessions, partners } from '../db/schema'
import { PARTNER_SESSION_COOKIE_NAME } from './partner-rules'

/**
 * Sesi login Partner Portal. Cookie dan tabelnya terpisah dari sesi jastiper
 * (`auth.ts`), jadi sesi partner tidak pernah dianggap sesi user biasa — dan
 * sebaliknya. Server-only.
 */

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 hari, sama dengan user

export async function createPartnerSession(partnerId: string) {
  const token = randomUUID()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await db.insert(partnerSessions).values({ partnerId, token, expiresAt })

  setCookie(PARTNER_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  })
  return token
}

/** Partner pemilik sesi `token` (atau null kalau tidak ada / kedaluwarsa). */
export async function getPartnerBySessionToken(token: string | undefined) {
  if (!token) return null

  const rows = await db
    .select({ partner: partners, session: partnerSessions })
    .from(partnerSessions)
    .innerJoin(partners, eq(partnerSessions.partnerId, partners.id))
    .where(eq(partnerSessions.token, token))
    .limit(1)
  if (rows.length === 0) return null
  const row = rows[0]
  if (row.session.expiresAt < new Date()) return null
  // Partner yang belum membuat kata sandi tidak mungkin punya sesi, tapi
  // jaga-jaga: tanpa aktivasi, tidak dianggap login.
  if (!row.partner.activatedAt) return null
  return row.partner
}

/** Partner yang sedang login (atau null). Hanya untuk server function. */
export async function getCurrentPartner() {
  return getPartnerBySessionToken(getCookie(PARTNER_SESSION_COOKIE_NAME))
}

/**
 * Sama seperti `getCurrentPartner`, tapi untuk route API mentah: helper cookie
 * TanStack Start tidak jalan di sana, jadi cookie dibaca manual dari header.
 */
export async function getPartnerFromRequest(request: Request) {
  const header = request.headers.get('cookie') ?? ''
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index === -1) continue
    if (part.slice(0, index).trim() === PARTNER_SESSION_COOKIE_NAME) {
      try {
        return await getPartnerBySessionToken(
          decodeURIComponent(part.slice(index + 1).trim()),
        )
      } catch {
        // Cookie rusak (percent-encoding tidak valid) = tidak login.
        return null
      }
    }
  }
  return null
}

export class PartnerRequiredError extends Error {
  readonly code = 'PARTNER_REQUIRED'
  constructor() {
    super('Belum login sebagai partner')
    this.name = 'PartnerRequiredError'
  }
}

/** Pagar server: WAJIB dipanggil di baris pertama handler khusus partner. */
export async function requirePartner() {
  const partner = await getCurrentPartner()
  if (!partner) throw new PartnerRequiredError()
  return partner
}

export async function destroyPartnerSession() {
  const token = getCookie(PARTNER_SESSION_COOKIE_NAME)
  if (token) {
    await db.delete(partnerSessions).where(eq(partnerSessions.token, token))
  }
  deleteCookie(PARTNER_SESSION_COOKIE_NAME, { path: '/' })
}

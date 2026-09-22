import { getSessionUser } from './auth'
import type { users } from '../db/schema'

/**
 * PAGAR ADMIN (server).
 *
 * Route `/admin` sudah nge-redirect non-admin di `beforeLoad`, tapi itu cuma
 * proteksi UI — bisa dilewati dengan memanggil server function-nya langsung.
 * Jadi SETIAP server function di bawah `/admin` (metrik, daftar, approve/
 * reject) WAJIB panggil `requireAdminUser()` di baris pertama handler-nya.
 */
export class AdminRequiredError extends Error {
  readonly code = 'ADMIN_REQUIRED'
  constructor() {
    super('Aksi ini khusus admin')
    this.name = 'AdminRequiredError'
  }
}

export type AdminUser = typeof users.$inferSelect

export async function requireAdminUser(): Promise<AdminUser> {
  const user = await getSessionUser()
  if (!user) throw new Error('Belum login')
  if (!user.isAdmin) throw new AdminRequiredError()
  return user
}

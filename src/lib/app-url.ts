import { getRequest } from '@tanstack/react-start/server'

/**
 * Basis URL buat link di email. APP_URL dipakai kalau di-set (wajib di
 * produksi); kalau tidak, ambil origin dari request — praktis buat dev.
 * Server-only: jangan di-import dari halaman/komponen client.
 */
export function resolveAppUrl() {
  const configured = process.env.APP_URL?.trim()
  if (configured) return configured.replace(/\/+$/, '')
  return new URL(getRequest().url).origin
}

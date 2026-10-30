import { z } from 'zod'

/**
 * Paginasi daftar (tabel) — murni, tanpa `db`, dipakai UI dan server.
 * Halaman dihitung mulai dari 1. Server yang memegang `page` final: kalau
 * halaman yang diminta melewati halaman terakhir (mis. baris terakhir di
 * halaman itu baru dihapus), server mengembalikan halaman terakhir.
 */

export const PAGE_SIZE_OPTIONS = [10, 20, 50] as const
export const DEFAULT_PAGE_SIZE: number = PAGE_SIZE_OPTIONS[0]
export const MAX_PAGE_SIZE = 100

export type PageParams = { page: number; pageSize: number }

export type Paged<T> = {
  rows: Array<T>
  /** Jumlah seluruh baris yang cocok filter (bukan hanya halaman ini). */
  total: number
  /** Halaman yang benar-benar dikembalikan (sudah dibatasi 1..jumlah halaman). */
  page: number
  pageSize: number
}

/** Validasi input server function; dipakai bareng filter masing-masing daftar. */
export const pageParamsSchema = z.object({
  page: z.number().int().min(1).max(1_000_000),
  pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE),
})

/** Jumlah halaman; minimal 1 supaya daftar kosong tetap "halaman 1 dari 1". */
export function pageCount(total: number, pageSize: number): number {
  if (total <= 0 || pageSize <= 0) return 1
  return Math.ceil(total / pageSize)
}

/** Batasi halaman ke 1..jumlah halaman. */
export function clampPage(
  page: number,
  total: number,
  pageSize: number,
): number {
  const last = pageCount(total, pageSize)
  if (!Number.isFinite(page) || page < 1) return 1
  return Math.min(Math.floor(page), last)
}

/** Offset baris untuk `OFFSET` SQL. */
export function pageOffset(page: number, pageSize: number): number {
  return (Math.max(1, page) - 1) * pageSize
}

/**
 * Isian "loncat ke halaman" dari pengguna → nomor halaman valid, atau null
 * kalau bukan angka bulat positif. Angka di luar rentang dibatasi ke ujung.
 */
export function parsePageInput(
  text: string,
  totalPages: number,
): number | null {
  const trimmed = text.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const value = Number(trimmed)
  if (value < 1) return null
  return Math.min(value, Math.max(1, totalPages))
}

/** Rentang baris yang tampil, mis. `{ from: 11, to: 20 }` untuk halaman 2. */
export function pageRange(
  page: number,
  pageSize: number,
  total: number,
): { from: number; to: number } {
  if (total <= 0) return { from: 0, to: 0 }
  const from = pageOffset(page, pageSize) + 1
  return { from, to: Math.min(total, from + pageSize - 1) }
}

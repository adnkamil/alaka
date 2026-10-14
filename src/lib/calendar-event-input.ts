import { z } from 'zod'

/**
 * Validasi input event kalender (dipakai server function admin; client juga
 * memakai konstanta batasnya supaya form dan server selalu sepakat).
 */

export const CALENDAR_EVENT_LIMITS = {
  name: 120,
  location: 200,
  description: 2000,
  exhibitor: 60,
  exhibitors: 30,
} as const

/** `YYYY-MM-DD` yang benar-benar ada di kalender (bukan 2026-02-31). */
export function isRealIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const [year, month, day] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ]
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

/**
 * Rapikan daftar brand: spasi berlebih dibuang, yang kosong dibuang, dan
 * duplikat (tanpa membedakan huruf besar/kecil) hanya disimpan sekali —
 * penulisan pertama yang dipakai.
 */
export function normalizeExhibitors(
  list: ReadonlyArray<string>,
): Array<string> {
  const seen = new Set<string>()
  const result: Array<string> = []
  for (const raw of list) {
    const name = raw.replace(/\s+/g, ' ').trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(name)
  }
  return result
}

export const calendarEventFieldsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Nama event wajib diisi')
    .max(CALENDAR_EVENT_LIMITS.name, 'Nama event terlalu panjang'),
  location: z
    .string()
    .trim()
    .min(1, 'Lokasi wajib diisi')
    .max(CALENDAR_EVENT_LIMITS.location, 'Lokasi terlalu panjang'),
  eventDate: z.string().refine(isRealIsoDate, 'Tanggal tidak valid'),
  description: z
    .string()
    .trim()
    .max(CALENDAR_EVENT_LIMITS.description, 'Deskripsi terlalu panjang'),
  exhibitors: z
    .array(
      z
        .string()
        .max(CALENDAR_EVENT_LIMITS.exhibitor, 'Nama brand terlalu panjang'),
    )
    .max(CALENDAR_EVENT_LIMITS.exhibitors, 'Terlalu banyak brand'),
})

export type CalendarEventFields = z.infer<typeof calendarEventFieldsSchema>

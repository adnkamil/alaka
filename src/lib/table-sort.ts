import { z } from 'zod'

/**
 * Sorting header tabel partner — murni, tanpa `db`, dipakai UI dan server.
 * Klik header: naik (asc) → turun (desc) → kembali ke urutan bawaan (null).
 */

export type SortDir = 'asc' | 'desc'
export type SortState<TKey extends string = string> = { key: TKey; dir: SortDir } | null

/** Status sort berikutnya setelah header `key` diklik. */
export function nextSort<TKey extends string>(
  current: SortState<TKey>,
  key: TKey,
): SortState<TKey> {
  if (!current || current.key !== key) return { key, dir: 'asc' }
  if (current.dir === 'asc') return { key, dir: 'desc' }
  return null
}

type SortValue = string | number | boolean | Date | null | undefined

function normalize(value: SortValue): string | number | null {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'boolean') return value ? 1 : 0
  return value
}

const collator = new Intl.Collator('id', { numeric: true, sensitivity: 'base' })

/**
 * Urutkan salinan `rows`. Tanpa `sort` urutan asli dikembalikan apa adanya.
 * Nilai kosong selalu di bawah, baik asc maupun desc.
 */
export function sortRows<T, TKey extends string>(
  rows: ReadonlyArray<T>,
  sort: SortState<TKey>,
  getters: Record<TKey, (row: T) => SortValue>,
): Array<T> {
  if (!sort) return [...rows]
  const get = getters[sort.key]
  const sign = sort.dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const x = normalize(get(a))
    const y = normalize(get(b))
    if (x === null && y === null) return 0
    if (x === null) return 1
    if (y === null) return -1
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * sign
    return collator.compare(String(x), String(y)) * sign
  })
}

/** Validasi input server function untuk sort; hanya kunci kolom yang diizinkan. */
export function sortParamSchema<const TKey extends readonly [string, ...Array<string>]>(
  keys: TKey,
) {
  return z
    .object({ key: z.enum(keys), dir: z.enum(['asc', 'desc']) })
    .nullish()
}

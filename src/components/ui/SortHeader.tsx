import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import type { SortState } from '../../lib/table-sort'

interface SortHeaderProps<TKey extends string> {
  label: string
  /** Kunci kolom; kosongkan kalau kolom tidak bisa diurutkan. */
  sortKey?: TKey
  sort: SortState<TKey>
  onSort: (key: TKey) => void
  align?: 'left' | 'right'
  title?: string
  className?: string
}

/**
 * Isi header kolom yang bisa diurutkan. Warna dan huruf mengikuti header
 * induknya; yang ditambahkan hanya tombol + ikon arah urutan.
 */
export default function SortHeader<TKey extends string>({
  label,
  sortKey,
  sort,
  onSort,
  align = 'left',
  title,
  className = '',
}: SortHeaderProps<TKey>) {
  const justify = align === 'right' ? 'justify-end' : 'justify-start'
  if (!sortKey) {
    return (
      <span className={`flex ${justify} ${className}`} title={title}>
        {label}
      </span>
    )
  }
  const active = sort?.key === sortKey
  const Icon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown
  const next = !active ? 'naik' : sort.dir === 'asc' ? 'turun' : 'normal'
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      aria-label={`Urutkan ${label} (${next})`}
      title={title ?? `Urutkan ${label}`}
      className={`inline-flex w-full items-center gap-1 ${justify} ${className}`}
      style={{
        font: 'inherit',
        letterSpacing: 'inherit',
        textTransform: 'inherit',
        color: 'inherit',
        cursor: 'pointer',
        background: 'none',
        border: 0,
        padding: 0,
      }}
    >
      <span>{label}</span>
      <Icon size={12} aria-hidden="true" style={{ opacity: active ? 1 : 0.45 }} />
    </button>
  )
}

/** Nilai `aria-sort` untuk elemen kolom (`th` / `role=columnheader`). */
export function ariaSortOf<TKey extends string>(
  sort: SortState<TKey>,
  key: TKey,
): 'ascending' | 'descending' | 'none' {
  if (sort?.key !== key) return 'none'
  return sort.dir === 'asc' ? 'ascending' : 'descending'
}

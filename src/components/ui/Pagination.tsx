import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  PAGE_SIZE_OPTIONS,
  pageCount,
  parsePageInput,
} from '../../lib/pagination'

interface PaginationProps {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
  className?: string
}

const boxStyle = {
  borderColor: 'var(--app-border)',
  background: 'var(--app-card)',
  color: 'var(--app-text)',
} as const

/**
 * Kontrol paginasi tabel: "[10 ▾] per halaman ‹ [1] dari N › Halaman [ ]".
 * Kotak halaman dan kotak "Halaman" sama-sama meloncat ke nomor yang diketik
 * saat menekan Enter (atau keluar dari kotak). Tidak tampil kalau datanya
 * tidak lebih banyak dari ukuran halaman terkecil.
 */
export default function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  className = '',
}: PaginationProps) {
  const totalPages = pageCount(total, pageSize)
  // Isian sementara; null = tampilkan nomor halaman yang aktif.
  const [pageDraft, setPageDraft] = useState<string | null>(null)
  const [jumpDraft, setJumpDraft] = useState('')

  if (total <= PAGE_SIZE_OPTIONS[0]) return null

  function commit(text: string) {
    const target = parsePageInput(text, totalPages)
    if (target !== null && target !== page) onPageChange(target)
  }

  const navButton =
    'flex size-9 shrink-0 items-center justify-center rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-40'
  const numberBox =
    'h-9 w-14 rounded-lg border text-center text-sm font-medium outline-none focus:border-[var(--app-accent)]'

  return (
    <div
      className={`flex flex-wrap items-center justify-end gap-x-3 gap-y-2 text-[13px] ${className}`}
      style={{ color: 'var(--app-text-soft)' }}
    >
      <label className="flex items-center gap-2">
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          aria-label="Jumlah data per halaman"
          className="h-9 rounded-lg border px-2.5 text-sm font-medium outline-none focus:border-[var(--app-accent)]"
          style={boxStyle}
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        per halaman
      </label>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className={navButton}
          style={boxStyle}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Halaman sebelumnya"
        >
          <ChevronLeft size={18} />
        </button>
        <input
          inputMode="numeric"
          aria-label="Halaman saat ini"
          value={pageDraft ?? String(page)}
          onChange={(e) => setPageDraft(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={() => {
            if (pageDraft !== null) commit(pageDraft)
            setPageDraft(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') {
              setPageDraft(null)
              e.currentTarget.blur()
            }
          }}
          className={numberBox}
          style={boxStyle}
        />
        <span className="whitespace-nowrap">
          dari {totalPages.toLocaleString('id-ID')}
        </span>
        <button
          type="button"
          className={navButton}
          style={boxStyle}
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Halaman berikutnya"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <label className="hidden items-center gap-2 sm:flex">
        Halaman
        <input
          inputMode="numeric"
          aria-label="Loncat ke halaman"
          value={jumpDraft}
          onChange={(e) => setJumpDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            commit(jumpDraft)
            setJumpDraft('')
          }}
          className={numberBox}
          style={boxStyle}
        />
      </label>
    </div>
  )
}

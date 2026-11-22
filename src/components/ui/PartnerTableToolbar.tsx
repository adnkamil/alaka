import { Search } from 'lucide-react'
import Pagination from './Pagination'

type PagerProps = React.ComponentProps<typeof Pagination>

interface PartnerTableToolbarProps {
  search: string
  onSearchChange: (value: string) => void
  placeholder?: string
  label?: string
  pager: PagerProps
  /** Filter tambahan (mis. dropdown status) di samping kolom cari. */
  filter?: React.ReactNode
}

/**
 * Baris di atas tabel partner: kolom cari di kiri, paginasi di kanan.
 * Dipakai semua tabel partner supaya tampilannya seragam.
 */
export default function PartnerTableToolbar({
  search,
  onSearchChange,
  placeholder = 'Cari',
  label = 'Cari',
  pager,
  filter,
}: PartnerTableToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        <div className="relative w-full max-w-[336px] sm:w-[336px]">
          <Search
            size={17}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--app-text-soft)' }}
          />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={placeholder}
            aria-label={label}
            className="app-input pl-10"
            style={{ height: 42, borderRadius: 12 }}
          />
        </div>
        {filter}
      </div>
      <Pagination {...pager} className="justify-end" />
    </div>
  )
}

import { useNavigate, useRouterState } from '@tanstack/react-router'
import { Search } from 'lucide-react'

/**
 * Topbar admin desktop. Kolom cari hanya ada di halaman Partner dan memakai
 * parameter URL `?q=` yang sama dengan kolom cari di halaman itu, jadi
 * keduanya selalu sinkron dan hasil pencarian bisa di-bookmark.
 */
export default function AdminTopbar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const q = useRouterState({
    select: (s) => (s.location.search as { q?: string }).q ?? '',
  })
  const navigate = useNavigate()
  const isPartnerPage = pathname.replace(/\/+$/, '') === '/admin/partner'

  return (
    <header className="pm-topbar">
      {isPartnerPage ? (
        <div className="relative w-full max-w-[380px]">
          <Search
            size={17}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--app-text-soft)' }}
          />
          <input
            type="search"
            value={q}
            onChange={(e) =>
              void navigate({
                to: '/admin/partner',
                search: { q: e.target.value || undefined },
                replace: true,
              })
            }
            placeholder="Cari partner..."
            aria-label="Cari partner"
            className="app-input pl-10"
            style={{ height: 42, borderRadius: 12 }}
          />
        </div>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-3">
        <span
          className="pm-display flex size-9 items-center justify-center rounded-full text-xs"
          style={{
            background: 'var(--app-accent-soft)',
            color: 'var(--app-accent)',
          }}
        >
          AD
        </span>
        <span className="text-[13px] font-bold">Admin ALAKA</span>
      </div>
    </header>
  )
}

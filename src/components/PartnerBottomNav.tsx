import { Link, useRouterState } from '@tanstack/react-router'
import { Home, Package } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface TabDef {
  to: '/partner' | '/partner/katalog'
  label: string
  icon: LucideIcon
}

const TABS: Array<TabDef> = [
  { to: '/partner', label: 'Beranda', icon: Home },
  { to: '/partner/katalog', label: 'Katalog', icon: Package },
]

/**
 * Bottom tab Partner Portal. Bentuk dan cara menentukan tab aktif sama dengan
 * `AdminBottomNav` (berdasarkan pathname, bukan `activeProps`, supaya Beranda
 * tidak ikut menyala di `/partner/katalog`). Tab Event menyusul.
 */
export default function PartnerBottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const current = pathname.replace(/\/+$/, '')

  return (
    <nav
      className="fixed bottom-0 left-1/2 z-40 w-full -translate-x-1/2 border-t"
      style={{
        maxWidth: 480,
        borderColor: 'var(--app-border)',
        background: 'var(--app-card)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-between px-2 py-1.5">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const active =
            current === tab.to ||
            (tab.to !== '/partner' && current.startsWith(`${tab.to}/`))
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className="flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-xs no-underline"
              style={{
                color: active ? 'var(--app-accent)' : 'var(--app-text-mute)',
                fontWeight: active ? 600 : 400,
              }}
            >
              <Icon size={20} />
              {tab.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

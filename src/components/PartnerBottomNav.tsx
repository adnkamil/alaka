import { Link, useRouterState } from '@tanstack/react-router'
import { CalendarDays, Home, Package, User } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface TabDef {
  to: '/partner' | '/partner/katalog' | '/partner/event' | '/partner/profil'
  label: string
  icon: LucideIcon
}

const TABS: Array<TabDef> = [
  { to: '/partner', label: 'Beranda', icon: Home },
  { to: '/partner/katalog', label: 'Katalog', icon: Package },
  { to: '/partner/event', label: 'Event', icon: CalendarDays },
  { to: '/partner/profil', label: 'Profil', icon: User },
]

/**
 * Bottom tab Partner Portal, mengikuti desain Figma (nav putih, ikon 22px,
 * label 11px; tab aktif bold berwarna aksen). Tinggi tetap 72px agar halaman
 * ber-footer tombol (`.pm-footer`) bisa menempel tepat di atasnya.
 * Tab aktif ditentukan dari pathname, bukan `activeProps`, supaya Beranda
 * tidak ikut menyala di `/partner/katalog`.
 */
export default function PartnerBottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const current = pathname.replace(/\/+$/, '')

  return (
    <nav
      className="fixed bottom-0 left-1/2 z-40 w-full -translate-x-1/2 border-t"
      style={{
        maxWidth: 480,
        height: 'calc(72px + env(safe-area-inset-bottom, 0px))',
        borderColor: 'var(--app-border)',
        background: '#ffffff',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="mx-auto flex h-[72px] max-w-lg items-center justify-between px-2">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const active =
            current === tab.to ||
            (tab.to !== '/partner' && current.startsWith(`${tab.to}/`))
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className="flex flex-1 flex-col items-center gap-1 py-1 text-[11px] no-underline"
              style={{
                color: active ? 'var(--app-accent)' : 'var(--app-text-soft)',
                fontWeight: active ? 700 : 500,
              }}
            >
              <Icon size={22} />
              {tab.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

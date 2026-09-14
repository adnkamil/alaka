import { Link, useRouterState } from '@tanstack/react-router'
import { ClipboardList, Home, Plus, User, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface TabDef {
  to: '/' | '/keuangan' | '/pesanan/new' | '/pesanan' | '/profil'
  label: string
  icon: LucideIcon
  isFab?: boolean
}

const TABS: Array<TabDef> = [
  { to: '/', label: 'Beranda', icon: Home },
  { to: '/keuangan', label: 'Keuangan', icon: Wallet },
  { to: '/pesanan/new', label: 'Tambah', icon: Plus, isFab: true },
  { to: '/pesanan', label: 'Pesanan', icon: ClipboardList },
  { to: '/profil', label: 'Profil', icon: User },
]

// Detail pages hide the bottom nav; match on path prefix instead of exact route.
const DETAIL_PATH_PREFIXES = [
  '/events/',
  '/profil/fee-rules',
  '/profil/customers',
  '/invoice/',
]

export function useShowBottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  return !DETAIL_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

export default function BottomNav() {
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
      <div className="mx-auto flex max-w-lg items-end justify-between px-2 py-1.5">
        {TABS.map((tab) => {
          const Icon = tab.icon
          if (tab.isFab) {
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className="-mt-6 flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full shadow-lg"
                style={{ background: 'var(--app-accent)' }}
                aria-label={tab.label}
              >
                <Icon size={26} color="white" />
              </Link>
            )
          }
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className="flex flex-1 flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-xs"
              style={{ color: 'var(--app-text-mute)' }}
              activeProps={{
                style: { color: 'var(--app-accent)', fontWeight: 600 },
              }}
              activeOptions={{ exact: tab.to === '/' }}
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
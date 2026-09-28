import { Link, useRouterState } from '@tanstack/react-router'
import { LayoutDashboard, Settings, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface TabDef {
  to: '/admin' | '/admin/customers' | '/admin/pengaturan'
  label: string
  icon: LucideIcon
}

const TABS: Array<TabDef> = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/customers', label: 'Customer', icon: Users },
  { to: '/admin/pengaturan', label: 'Pengaturan', icon: Settings },
]

/**
 * Bottom tab admin — tiga halaman admin, jadi navigasinya cukup di sini dan
 * header tinggal identitas (tanpa tombol). Bentuknya meniru `BottomNav.tsx`
 * member (fixed, max 480px, safe-area) supaya perpindahan halaman terasa sama.
 *
 * Halaman aktif ditentukan dari `pathname` yang sudah dirapikan, BUKAN
 * `activeProps`: kecocokan route bawaan TanStack Router itu berawalan (prefix),
 * jadi tab Dashboard (`/admin`) ikut menyala di `/admin/customers`. Cara ini
 * sekaligus menyamakan `/admin` dan `/admin/`.
 */
export default function AdminBottomNav() {
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
          const active = current === tab.to
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

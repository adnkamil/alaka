import { Link, Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { LayoutDashboard, ListChecks } from 'lucide-react'
import { fetchCurrentUser } from '../lib/auth-functions'

// Proteksi di sini cuma buat UX (redirect kalau bukan admin). Proteksi yang
// beneran mengikat ada di server lewat `requireAdminUser()` — lihat
// `src/lib/admin.ts` — jadi walaupun beforeLoad ini dilewati, server function
// admin tetap menolak.
export const Route = createFileRoute('/admin')({
  beforeLoad: async () => {
    const user = await fetchCurrentUser()
    if (!user) {
      throw redirect({ to: '/login' })
    }
    if (!user.isAdmin) {
      throw redirect({ to: '/' })
    }
    return { user }
  },
  component: AdminLayout,
})

const TABS = [
  { to: '/admin' as const, label: 'Dashboard', icon: LayoutDashboard },
  {
    to: '/admin/subscriptions' as const,
    label: 'Langganan',
    icon: ListChecks,
  },
]

function AdminLayout() {
  return (
    <div className="app-shell mx-auto min-h-screen max-w-2xl">
      <header
        className="sticky top-0 z-10 flex items-center justify-between border-b px-4 py-3"
        style={{
          borderColor: 'var(--app-border)',
          background: 'var(--app-card)',
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="app-icon-tile h-8 w-8"
            style={{ fontSize: '0.75rem', fontWeight: 700 }}
          >
            A
          </span>
          <span className="text-sm font-bold">Admin Jastip</span>
        </div>
        <nav className="flex gap-4">
          {TABS.map((tab) => {
            const Icon = tab.icon
            return (
              <Link
                key={tab.to}
                to={tab.to}
                activeOptions={{ exact: tab.to === '/admin' }}
                className="flex items-center gap-1.5 text-xs font-semibold no-underline"
                style={{ color: 'var(--app-text-soft)' }}
                activeProps={{ style: { color: 'var(--app-accent)' } }}
              >
                <Icon size={15} />
                {tab.label}
              </Link>
            )
          })}
        </nav>
      </header>
      <Outlet />
    </div>
  )
}

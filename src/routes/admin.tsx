import {
  Outlet,
  createFileRoute,
  redirect,
  useNavigate,
} from '@tanstack/react-router'
import { LogOut } from 'lucide-react'
import { fetchCurrentUser, logoutUser } from '../lib/auth-functions'

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

function AdminLayout() {
  const navigate = useNavigate()

  async function handleLogout() {
    await logoutUser()
    await navigate({ to: '/login' })
  }

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
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-xs font-semibold"
          style={{ color: 'var(--app-danger)' }}
          aria-label="Keluar"
        >
          <LogOut size={15} />
          Keluar
        </button>
      </header>
      <Outlet />
    </div>
  )
}
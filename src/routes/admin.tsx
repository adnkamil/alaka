import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import AdminBottomNav from '../components/AdminBottomNav'
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

/**
 * Layout admin: header cuma identitas, navigasi antar halaman admin ada di
 * `AdminBottomNav` (Dashboard / Customer / Pengaturan). `app-shell--with-nav`
 * menyediakan ruang di bawah supaya isi terakhir tidak tertutup nav yang fixed.
 */
function AdminLayout() {
  return (
    <div className="app-shell app-shell--with-nav">
      <header
        className="sticky top-0 z-10 flex items-center gap-2 border-b px-4 py-3"
        style={{
          borderColor: 'var(--app-border)',
          background: 'var(--app-card)',
        }}
      >
        <span
          className="app-icon-tile h-8 w-8"
          style={{ fontSize: '0.75rem', fontWeight: 700 }}
        >
          A
        </span>
        <span className="text-sm font-bold">Admin ALAKA</span>
      </header>
      <Outlet />
      <AdminBottomNav />
    </div>
  )
}

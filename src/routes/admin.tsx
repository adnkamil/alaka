import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import AdminBottomNav from '../components/AdminBottomNav'
import AdminSidebar from '../components/AdminSidebar'
import AdminTopbar from '../components/AdminTopbar'
import { currentUserQuery } from '../lib/queries'

// Proteksi di sini cuma buat UX (redirect kalau bukan admin). Proteksi yang
// beneran mengikat ada di server lewat `requireAdminUser()` — lihat
// `src/lib/admin.ts` — jadi walaupun beforeLoad ini dilewati, server function
// admin tetap menolak.
export const Route = createFileRoute('/admin')({
  beforeLoad: async ({ context }) => {
    const user = await context.queryClient.ensureQueryData(currentUserQuery)
    if (!user) {
      context.queryClient.removeQueries({
        queryKey: currentUserQuery.queryKey,
      })
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
 * Layout admin. Mobile: header identitas + `AdminBottomNav`. Desktop (>= lg):
 * sidebar + topbar (Figma "D8 Admin"); halaman yang belum punya layout desktop
 * tampil sebagai kolom 480px di tengah area konten. `app-shell--with-nav`
 * menyediakan ruang di bawah supaya isi terakhir tidak tertutup nav yang fixed.
 */
function AdminLayout() {
  return (
    <div className="pm-root adm-palette">
      <AdminSidebar />
      <div className="pm-main">
        <AdminTopbar />
        <div className="app-shell app-shell--with-nav pm-content">
          <header
            className="sticky top-0 z-10 flex items-center gap-2 border-b px-4 py-3 lg:hidden"
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
        </div>
      </div>
      <AdminBottomNav />
    </div>
  )
}

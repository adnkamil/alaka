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
 * Layout admin, bergaya sama dengan Partner Portal (palet `.pm`). Mobile:
 * `AdminBottomNav`. Desktop (>= lg):
 * sidebar + topbar (Figma "D8 Admin"); halaman yang belum punya layout desktop
 * tampil sebagai kolom 480px di tengah area konten. `app-shell--with-nav`
 * menyediakan ruang di bawah supaya isi terakhir tidak tertutup nav yang fixed.
 */
function AdminLayout() {
  return (
    <div className="pm pm-root">
      <AdminSidebar />
      <div className="pm-main">
        <AdminTopbar />
        <div className="app-shell app-shell--with-nav pm-content">
          <Outlet />
        </div>
      </div>
      <AdminBottomNav />
    </div>
  )
}

import { useQuery } from '@tanstack/react-query'
import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import BottomNav, { useShowBottomNav } from '../components/BottomNav'
import VerifyEmailBanner from '../components/VerifyEmailBanner'
import { currentUserQuery } from '../lib/queries'

export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context }) => {
    // Lewat cache query: pindah tab tidak lagi memanggil API di sini (dan
    // tidak dobel dengan loader halaman yang juga butuh 'current-user').
    // Proteksi yang mengikat tetap di server (`requireUser()` di tiap
    // server function). Hasil `null` dibuang dari cache supaya tidak
    // "menempel" setelah user login.
    const user = await context.queryClient.ensureQueryData(currentUserQuery)
    if (!user) {
      context.queryClient.removeQueries({
        queryKey: currentUserQuery.queryKey,
      })
      throw redirect({ to: '/login' })
    }
    if (user.isAdmin) {
      throw redirect({ to: '/admin' })
    }
    return { user }
  },
  component: AppLayout,
})

function AppLayout() {
  const showBottomNav = useShowBottomNav()
  // Data user dari cache yang sama dengan `beforeLoad`; di-query ulang di sini
  // supaya banner hilang begitu verifikasi selesai (cache di-invalidate).
  const { data: user } = useQuery(currentUserQuery)

  return (
    <div className={`app-shell ${showBottomNav ? 'app-shell--with-nav' : ''}`}>
      {/* {user && !user.emailVerified && <VerifyEmailBanner email={user.email} />} */}
      <Outlet />
      {showBottomNav && <BottomNav />}
    </div>
  )
}

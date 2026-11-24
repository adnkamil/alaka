import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import BottomNav, { useShowBottomNav } from '../components/BottomNav'
import LandingPage from '../components/LandingPage'
import { shouldShowLanding } from '../lib/landing'
import { currentUserQuery } from '../lib/queries'

export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context, location }) => {
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
      // Pengunjung belum login di `/` melihat landing page publik (URL tetap
      // `/`, bagus untuk SEO). Pembukaan dari ikon PWA (`/?source=pwa`) dan
      // path lain tetap ke /login — lihat `lib/landing.ts`.
      if (
        shouldShowLanding({
          isLoggedIn: false,
          pathname: location.pathname,
          search: location.search,
        })
      ) {
        return { user: null, showLanding: true as const }
      }
      throw redirect({ to: '/login' })
    }
    if (user.isAdmin) {
      throw redirect({ to: '/admin' })
    }
    return { user, showLanding: false as const }
  },
  component: AppLayout,
})

function AppLayout() {
  const { showLanding } = Route.useRouteContext()
  const showBottomNav = useShowBottomNav()

  if (showLanding) return <LandingPage />

  return (
    <div className={`app-shell ${showBottomNav ? 'app-shell--with-nav' : ''}`}>
      <Outlet />
      {showBottomNav && <BottomNav />}
    </div>
  )
}

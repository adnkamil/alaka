import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import BottomNav, { useShowBottomNav } from '../components/BottomNav'
import { fetchCurrentUser } from '../lib/auth-functions'

export const Route = createFileRoute('/_app')({
  beforeLoad: async () => {
    const user = await fetchCurrentUser()
    if (!user) {
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

  return (
    <div className={`app-shell ${showBottomNav ? 'app-shell--with-nav' : ''}`}>
      <Outlet />
      {showBottomNav && <BottomNav />}
    </div>
  )
}

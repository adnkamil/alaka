import { useQueryClient } from '@tanstack/react-query'
import {
  Outlet,
  createFileRoute,
  redirect,
  useNavigate,
} from '@tanstack/react-router'
import { LogOut } from 'lucide-react'
import { logoutPartner } from '../lib/partner-functions'
import { currentPartnerQuery } from '../lib/queries'

// Proteksi di sini cuma buat UX (redirect kalau belum login sebagai partner).
// Yang beneran mengikat ada di server lewat `requirePartner()` — lihat
// `src/lib/partner-auth.ts` — jadi walaupun beforeLoad ini dilewati, server
// function partner tetap menolak.
export const Route = createFileRoute('/partner')({
  beforeLoad: async ({ context }) => {
    const partner =
      await context.queryClient.ensureQueryData(currentPartnerQuery)
    if (!partner) {
      context.queryClient.removeQueries({
        queryKey: currentPartnerQuery.queryKey,
      })
      throw redirect({ to: '/login' })
    }
    return { partner }
  },
  component: PartnerLayout,
})

function PartnerLayout() {
  const { partner } = Route.useRouteContext()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  async function handleLogout() {
    await logoutPartner()
    queryClient.clear()
    await navigate({ to: '/login' })
  }

  return (
    <div className="app-shell">
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
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-sm font-bold">ALAKA Partner</p>
          <p
            className="truncate text-xs"
            style={{ color: 'var(--app-text-soft)' }}
          >
            {partner.name}
          </p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-semibold"
          style={{ color: 'var(--app-accent)' }}
        >
          <LogOut size={14} />
          Keluar
        </button>
      </header>
      <Outlet />
    </div>
  )
}

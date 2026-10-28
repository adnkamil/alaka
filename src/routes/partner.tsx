import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import PartnerBottomNav from '../components/PartnerBottomNav'
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

// `.pm` memasang palet & gaya mobile partner sesuai desain Figma (lihat
// src/styles.css). Header global dihapus; tombol Keluar pindah ke Profil.
function PartnerLayout() {
  return (
    <div className="app-shell app-shell--with-nav pm">
      <Outlet />
      <PartnerBottomNav />
    </div>
  )
}

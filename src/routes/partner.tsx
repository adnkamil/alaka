import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import PartnerBottomNav from '../components/PartnerBottomNav'
import { PartnerI18nProvider } from '../components/PartnerI18n'
import PartnerSidebar from '../components/PartnerSidebar'
import PartnerTopbar from '../components/PartnerTopbar'
import { currentPartnerQuery, partnerLocaleQuery } from '../lib/queries'

// Proteksi di sini cuma buat UX (redirect kalau belum login sebagai partner).
// Yang beneran mengikat ada di server lewat `requirePartner()` — lihat
// `src/lib/partner-auth.ts` — jadi walaupun beforeLoad ini dilewati, server
// function partner tetap menolak.
export const Route = createFileRoute('/partner')({
  beforeLoad: async ({ context }) => {
    // Bahasa ikut di-prefetch supaya SSR langsung merender bahasa pilihan.
    const [partner] = await Promise.all([
      context.queryClient.ensureQueryData(currentPartnerQuery),
      context.queryClient.ensureQueryData(partnerLocaleQuery),
    ])
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

// `.pm` memasang palet & gaya partner sesuai desain Figma (lihat
// src/styles.css). Di mobile: kolom 480px + bottom nav. Di desktop (>= lg):
// sidebar + topbar, dan isi halaman memenuhi sisa lebar (`.pm-content`).
function PartnerLayout() {
  const { data: partner } = useSuspenseQuery(currentPartnerQuery)
  // `beforeLoad` sudah memastikan partner ada; ini cuma penyempit tipe.
  if (!partner) return null

  return (
    <PartnerI18nProvider>
      <div className="pm pm-root">
        <PartnerSidebar name={partner.name} logoUrl={partner.logoUrl} />
        <div className="pm-main">
          <PartnerTopbar name={partner.name} logoUrl={partner.logoUrl} />
          <div className="app-shell app-shell--with-nav pm-content">
            <Outlet />
          </div>
        </div>
        <PartnerBottomNav />
      </div>
    </PartnerI18nProvider>
  )
}

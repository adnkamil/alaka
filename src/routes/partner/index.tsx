import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { CalendarDays, Package } from 'lucide-react'
import { currentPartnerQuery } from '../../lib/queries'
import { formatPhoneNumber } from '../../lib/format'

export const Route = createFileRoute('/partner/')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(currentPartnerQuery),
  component: PartnerHomePage,
})

function PartnerHomePage() {
  const { data: partner } = useSuspenseQuery(currentPartnerQuery)
  // Layout `/partner` sudah memastikan partner ada; ini cuma penyempit tipe.
  if (!partner) return null

  return (
    <main className="px-4 pb-6 pt-6">
      <h1 className="mb-1 text-xl font-bold">Halo, {partner.name}</h1>
      <p className="mb-5 text-xs" style={{ color: 'var(--app-text-soft)' }}>
        Selamat datang di Partner Portal ALAKA.
      </p>

      <div className="app-card mb-4 p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide">
          Akun
        </p>
        <dl className="flex flex-col gap-1.5 text-sm">
          <div className="flex justify-between gap-3">
            <dt style={{ color: 'var(--app-text-soft)' }}>Email</dt>
            <dd className="truncate font-medium">{partner.email}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt style={{ color: 'var(--app-text-soft)' }}>No. WhatsApp</dt>
            <dd className="font-medium">
              {partner.waNumber ? formatPhoneNumber(partner.waNumber) : '-'}
            </dd>
          </div>
        </dl>
      </div>

      <div className="app-card flex flex-col gap-3 p-4">
        <p className="text-sm font-semibold">Segera hadir</p>
        <div className="flex items-start gap-3 text-sm">
          <span className="app-icon-tile h-9 w-9 shrink-0">
            <Package size={16} />
          </span>
          <p style={{ color: 'var(--app-text-soft)' }}>
            Katalog produk dan harga brand kamu.
          </p>
        </div>
        <div className="flex items-start gap-3 text-sm">
          <span className="app-icon-tile h-9 w-9 shrink-0">
            <CalendarDays size={16} />
          </span>
          <p style={{ color: 'var(--app-text-soft)' }}>
            Buat event dan lihat jastiper yang ikut.
          </p>
        </div>
      </div>
    </main>
  )
}

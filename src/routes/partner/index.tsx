import { useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { CalendarDays, Package, Plus, ShoppingBag, Users } from 'lucide-react'
import PartnerEventStatusBadge from '../../components/PartnerEventStatusBadge'
import { formatDate, formatPhoneNumber } from '../../lib/format'
import { formatDateRange } from '../../lib/calendar'
import { partnerEventStatus } from '../../lib/partner-event-rules'
import {
  currentPartnerQuery,
  partnerDashboardQuery,
  partnerEventsQuery,
} from '../../lib/queries'
import { todayIsoDateInAppTimeZone } from '../../lib/timezone'
import type { LucideIcon } from 'lucide-react'

export const Route = createFileRoute('/partner/')({
  // Angka di Beranda berubah di luar sesi partner (jastiper menekan "Ikut
  // Event"), jadi selalu ambil ulang saat halaman dibuka — bukan dari cache.
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(currentPartnerQuery),
      context.queryClient.fetchQuery({
        ...partnerDashboardQuery,
        staleTime: 0,
      }),
      context.queryClient.fetchQuery({ ...partnerEventsQuery, staleTime: 0 }),
    ]),
  component: PartnerHomePage,
})

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: number
  icon: LucideIcon
}) {
  return (
    <div className="app-card flex flex-col gap-1.5 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
          {label}
        </p>
        <Icon size={15} style={{ color: 'var(--app-accent)' }} />
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  )
}

function PartnerHomePage() {
  const { data: partner } = useSuspenseQuery(currentPartnerQuery)
  const { data: dashboard } = useSuspenseQuery(partnerDashboardQuery)
  const { data: events } = useSuspenseQuery(partnerEventsQuery)
  // Layout `/partner` sudah memastikan partner ada; ini cuma penyempit tipe.
  if (!partner) return null

  const today = todayIsoDateInAppTimeZone()
  const upcoming = events
    .map((event) => ({ event, status: partnerEventStatus(event, today) }))
    .filter((item) => item.status !== 'selesai')
    // Yang sedang berjalan di atas, lalu yang terdekat mulainya.
    .sort(
      (a, b) =>
        Number(b.status === 'berjalan') - Number(a.status === 'berjalan') ||
        a.event.eventDate.localeCompare(b.event.eventDate),
    )

  return (
    <main className="px-4 pb-6 pt-6">
      <h1 className="mb-1 text-xl font-bold">Halo, {partner.name}</h1>
      <p className="mb-4 text-xs" style={{ color: 'var(--app-text-soft)' }}>
        Ringkasan brand kamu di ALAKA.
      </p>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <StatCard
          label="Produk aktif"
          value={dashboard.activeProducts}
          icon={Package}
        />
        <StatCard
          label="Event aktif"
          value={upcoming.length}
          icon={CalendarDays}
        />
        <StatCard
          label="Jastiper bergabung"
          value={dashboard.jastiperCount}
          icon={Users}
        />
        <StatCard
          label="Pesanan masuk"
          value={dashboard.orderCount}
          icon={ShoppingBag}
        />
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3">
        <Link
          to="/partner/katalog/baru"
          className="app-btn-outline flex items-center justify-center gap-1.5 no-underline"
        >
          <Plus size={14} />
          Tambah produk
        </Link>
        <Link
          to="/partner/event/baru"
          className="app-btn-primary flex items-center justify-center gap-1.5 no-underline"
        >
          <Plus size={14} />
          Buat event
        </Link>
      </div>

      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-base font-bold">Event berjalan dan mendatang</h2>
        <Link
          to="/partner/event"
          className="text-xs font-semibold no-underline"
          style={{ color: 'var(--app-accent)' }}
        >
          Lihat semua
        </Link>
      </div>
      {upcoming.length === 0 ? (
        <div
          className="app-card mb-5 p-4 text-sm"
          style={{ color: 'var(--app-text-soft)' }}
        >
          Belum ada event aktif.
        </div>
      ) : (
        <div className="mb-5 flex flex-col gap-2">
          {upcoming.slice(0, 3).map(({ event, status }) => (
            <Link
              key={event.id}
              to="/partner/event/$id"
              params={{ id: event.id }}
              className="app-card flex items-center gap-3 p-3 no-underline"
              style={{ color: 'inherit' }}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{event.name}</p>
                <p
                  className="truncate text-xs"
                  style={{ color: 'var(--app-text-soft)' }}
                >
                  {formatDateRange(event.eventDate, event.endDate)} ·{' '}
                  {event.participantCount} jastiper
                </p>
              </div>
              <PartnerEventStatusBadge status={status} />
            </Link>
          ))}
        </div>
      )}

      <h2 className="mb-2 text-base font-bold">Jastiper terbaru</h2>
      {dashboard.recentJoins.length === 0 ? (
        <div
          className="app-card mb-5 p-4 text-sm"
          style={{ color: 'var(--app-text-soft)' }}
        >
          Belum ada jastiper yang ikut event kamu.
        </div>
      ) : (
        <div className="app-card mb-5 flex flex-col divide-y p-1">
          {dashboard.recentJoins.map((join, i) => (
            <div key={i} className="flex flex-col px-3 py-2">
              <p className="text-sm font-semibold">
                {join.brandName ?? 'Tanpa nama'}
              </p>
              <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
                Ikut {join.eventName} · {formatDate(join.joinedAt)}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="app-card p-4">
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
    </main>
  )
}

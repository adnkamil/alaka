import { useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { CalendarDays, Package, Plus, ShoppingBag, Users } from 'lucide-react'
import { formatDate, formatPhoneNumber } from '../../lib/format'
import {
  currentPartnerQuery,
  partnerDashboardQuery,
  partnerEventsQuery,
} from '../../lib/queries'
import { partnerEventStatus } from '../../lib/partner-event-rules'
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

/** Inisial dari nama brand, mis. "Wikibex Official" → "WO". */
function initialsOf(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

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
    <div className="app-card flex flex-1 flex-col gap-1.5 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p
          className="text-xs font-medium"
          style={{ color: 'var(--app-text-soft)' }}
        >
          {label}
        </p>
        <Icon size={16} style={{ color: 'var(--app-accent)' }} />
      </div>
      <p className="pm-display text-[30px] leading-none">{value}</p>
    </div>
  )
}

/** Kotak tanggal (hari + bulan singkat), seperti DateBadge di Figma. */
function DateBadge({ date }: { date: string }) {
  const d = new Date(`${date}T00:00:00`)
  const day = d.getDate()
  const month = d
    .toLocaleDateString('id-ID', { month: 'short' })
    .replace('.', '')
    .toUpperCase()
  return (
    <div
      className="flex h-14 w-[52px] shrink-0 flex-col items-center justify-center rounded-xl"
      style={{ background: 'var(--app-accent-soft)', color: '#9c463b' }}
    >
      <p className="pm-display text-xl leading-none">{day}</p>
      <p className="mt-1 text-[10px] font-bold leading-none">{month}</p>
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
    <main className="flex flex-col gap-[18px] px-5 pb-6 pt-2">
      <header className="flex items-center gap-3 pt-2">
        <span
          className="pm-display flex size-11 shrink-0 items-center justify-center rounded-full text-[15px]"
          style={{ background: 'var(--app-accent-soft)', color: '#9c463b' }}
        >
          {initialsOf(partner.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
            Halo,
          </p>
          <p className="pm-display truncate text-lg">{partner.name}</p>
        </div>
        <span
          className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold"
          style={{ background: 'var(--pm-tint)', color: 'var(--pm-gold)' }}
        >
          PARTNER
        </span>
      </header>

      <div className="flex flex-col gap-2.5">
        <div className="flex gap-2.5">
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
        </div>
        <div className="flex gap-2.5">
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
      </div>

      <div className="flex gap-2.5">
        <Link
          to="/partner/katalog/baru"
          className="app-btn-outline flex-1 gap-2 no-underline"
        >
          <Plus size={18} />
          Tambah produk
        </Link>
        <Link
          to="/partner/event/baru"
          className="app-btn-primary flex-1 gap-2 no-underline"
        >
          <Plus size={18} />
          Buat event
        </Link>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="pm-display text-[17px]">Event berjalan</h2>
        <Link
          to="/partner/event"
          className="text-xs font-bold no-underline"
          style={{ color: 'var(--app-accent)' }}
        >
          Lihat semua
        </Link>
      </div>
      {upcoming.length === 0 ? (
        <div
          className="app-card p-4 text-sm"
          style={{ color: 'var(--app-text-soft)' }}
        >
          Belum ada event aktif.
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {upcoming.slice(0, 3).map(({ event }) => (
            <Link
              key={event.id}
              to="/partner/event/$id"
              params={{ id: event.id }}
              className="app-card flex items-center gap-3 p-3 no-underline"
              style={{ color: 'inherit' }}
            >
              <DateBadge date={event.eventDate} />
              <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                <p className="truncate text-sm font-bold">{event.name}</p>
                <p
                  className="truncate text-xs"
                  style={{ color: 'var(--app-text-soft)' }}
                >
                  {event.isOnline ? 'Online' : 'Offline'} · {event.location}
                </p>
              </div>
              <span
                className="app-badge shrink-0"
                style={{
                  background: 'var(--app-success-soft)',
                  color: 'var(--app-success)',
                }}
              >
                {event.participantCount} jastiper
              </span>
            </Link>
          ))}
        </div>
      )}

      <h2 className="pm-display text-[17px]">Jastiper terbaru</h2>
      {dashboard.recentJoins.length === 0 ? (
        <div
          className="app-card p-4 text-sm"
          style={{ color: 'var(--app-text-soft)' }}
        >
          Belum ada jastiper yang ikut event kamu.
        </div>
      ) : (
        <div className="app-card flex flex-col divide-y p-1">
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

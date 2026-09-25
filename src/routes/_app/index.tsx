import { useState } from 'react'
import { useSuspenseQuery, queryOptions } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ChevronDown, ChevronRight, Plus, ShoppingBag } from 'lucide-react'
import { listEvents } from '../../lib/events-functions'
import { fetchCurrentUser } from '../../lib/auth-functions'

const eventsQuery = queryOptions({
  queryKey: ['events'],
  queryFn: () => listEvents(),
})

const currentUserQuery = queryOptions({
  queryKey: ['current-user'],
  queryFn: () => fetchCurrentUser(),
})

export const Route = createFileRoute('/_app/')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(eventsQuery),
      context.queryClient.ensureQueryData(currentUserQuery),
    ]),
  component: BerandaPage,
})

function formatIDR(value: string | number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value))
}

type EventRow = Awaited<ReturnType<typeof listEvents>>[number]

/**
 * Kartu event. Event nonaktif (sudah ditutup jastiper) tampil lebih redup +
 * badge "Nonaktif" supaya jelas beda dari event yang masih jalan.
 */
function EventCard({ event }: { event: EventRow }) {
  return (
    <Link
      to="/events/$eventId"
      params={{ eventId: event.id }}
      className="app-card flex items-center gap-3 p-4 no-underline"
      style={event.isActive ? undefined : { opacity: 0.65 }}
    >
      <span className="app-icon-tile h-10 w-10 flex-shrink-0">
        <ShoppingBag size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-semibold">{event.name}</span>
          {!event.isActive && (
            <span
              className="app-badge flex-shrink-0"
              style={{
                background: 'var(--app-border)',
                color: 'var(--app-text-soft)',
              }}
            >
              Nonaktif
            </span>
          )}
        </span>
        <span
          className="block text-xs"
          style={{ color: 'var(--app-text-soft)' }}
        >
          {new Date(event.eventDate).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
          })}{' '}
          · {event.orderCount} pesanan
        </span>
      </span>
      <ChevronRight size={18} style={{ color: 'var(--app-text-mute)' }} />
    </Link>
  )
}

function BerandaPage() {
  const { data: events } = useSuspenseQuery(eventsQuery)
  const { data: user } = useSuspenseQuery(currentUserQuery)
  const [showInactive, setShowInactive] = useState(false)

  // Ringkasan uang menghitung SEMUA event (termasuk yang nonaktif) — event
  // ditutup bukan berarti uangnya hilang dari catatan.
  const amountIn = events.reduce((sum, e) => sum + Number(e.amountIn), 0)
  const outstanding = events.reduce((sum, e) => sum + Number(e.outstanding), 0)

  const activeEvents = events.filter((event) => event.isActive)
  const inactiveEvents = events.filter((event) => !event.isActive)

  return (
    <main className="mx-auto max-w-lg px-4 pb-8 pt-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">Jastip.ku</h1>
          <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
            Halo, {user?.name ?? 'Jastiper'}
          </p>
        </div>
        <Link
          to="/profil"
          className="app-avatar flex h-10 w-10 items-center justify-center"
        >
          {user?.name.at(0)?.toUpperCase() ?? '?'}
        </Link>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-3">
        <div className="app-card p-4">
          <p className="mb-1 text-sm" style={{ color: 'var(--app-text-soft)' }}>
            Uang masuk
          </p>
          <p className="text-xl font-bold">{formatIDR(amountIn)}</p>
        </div>
        <div className="app-card p-4">
          <p className="mb-1 text-sm" style={{ color: 'var(--app-text-soft)' }}>
            Belum bayar
          </p>
          <p
            className="text-xl font-bold"
            style={{ color: 'var(--app-warning)' }}
          >
            {formatIDR(outstanding)}
          </p>
        </div>
      </section>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold">Event aktif</h2>
        <Link
          to="/events/new"
          className="flex items-center gap-1 text-sm font-semibold no-underline"
          style={{ color: 'var(--app-accent)' }}
        >
          <Plus size={16} />
          Tambah event
        </Link>
      </div>

      {activeEvents.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
          {inactiveEvents.length > 0
            ? 'Tidak ada event aktif. Event yang sudah selesai bisa diaktifkan lagi dari halaman detailnya lewat menu ⋮.'
            : 'Belum ada event. Tambah event lewat tombol di atas.'}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {activeEvents.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>

      {/* Event nonaktif sengaja dipisah & terlipat: datanya tetap ada, tapi
          tidak mengganggu daftar event yang masih jalan. */}
      {inactiveEvents.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowInactive((v) => !v)}
            aria-expanded={showInactive}
            className="mt-6 flex w-full items-center justify-between rounded-xl border px-4 py-3"
            style={{
              borderColor: 'var(--app-border)',
              background: 'var(--app-card)',
            }}
          >
            <span className="text-sm font-bold">
              Event nonaktif ({inactiveEvents.length})
            </span>
            <ChevronDown
              size={18}
              style={{
                color: 'var(--app-text-mute)',
                transition: 'transform 150ms',
                transform: showInactive ? 'rotate(180deg)' : undefined,
              }}
            />
          </button>
          {showInactive && (
            <div className="mt-3 flex flex-col gap-3">
              {inactiveEvents.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          )}
        </>
      )}
    </main>
  )
}
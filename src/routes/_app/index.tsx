import { useSuspenseQuery, queryOptions } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ChevronRight, ShoppingBag } from 'lucide-react'
import { listEvents } from '../../lib/events-functions'
import { fetchCurrentUser } from '../../lib/auth-functions'
import { APP_TIME_ZONE } from '../../lib/timezone'
import NotificationBell from '../../components/NotificationBell'

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

/** Kartu event aktif di beranda. */
function EventCard({ event }: { event: EventRow }) {
  return (
    <Link
      to="/events/$eventId"
      params={{ eventId: event.id }}
      className="app-card flex items-center gap-3 p-4 no-underline"
    >
      <span className="app-icon-tile h-10 w-10 flex-shrink-0">
        <ShoppingBag size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-semibold">{event.name}</span>
        </span>
        <span
          className="block text-xs"
          style={{ color: 'var(--app-text-soft)' }}
        >
          {new Date(event.eventDate).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
            timeZone: APP_TIME_ZONE,
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

  // Ringkasan uang menghitung SEMUA event (termasuk yang nonaktif) — event
  // ditutup bukan berarti uangnya hilang dari catatan.
  const amountIn = events.reduce((sum, e) => sum + Number(e.amountIn), 0)
  const outstanding = events.reduce((sum, e) => sum + Number(e.outstanding), 0)

  const activeEvents = events.filter((event) => event.isActive)

  return (
    <main className="mx-auto max-w-lg px-4 pb-8 pt-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">
            {user?.brandName?.trim() || 'ALAKA'}
          </h1>
          <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
            {/* Sapaan pakai nama BRAND user (bukan nama pribadinya). Kalau
                brandnya belum diisi, jatuh ke nama user — sama seperti fallback
                di halaman Profil. */}
            Halo {user?.name || 'Jastiper'}
          </p>
        </div>
        <NotificationBell />
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
          <p className="text-xl font-bold">{formatIDR(outstanding)}</p>
        </div>
      </section>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold">Event aktif</h2>
        <Link
          to="/events/new"
          className="flex items-center gap-1 text-sm font-semibold no-underline"
          style={{ color: 'var(--app-accent)' }}
        >
          {/* <Plus size={16} /> */}
          Tambah event
        </Link>
      </div>

      {activeEvents.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
          Belum ada event aktif. Tambah event lewat tombol di atas.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {activeEvents.map((event) => (
          <EventCard key={event.id} event={event} />
        ))}
      </div>
    </main>
  )
}

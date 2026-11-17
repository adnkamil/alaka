import { useSuspenseQuery, queryOptions } from '@tanstack/react-query'
import { Link, createFileRoute, redirect } from '@tanstack/react-router'
import { ArrowLeft, ChevronRight, ShoppingBag } from 'lucide-react'
import { listEvents } from '../../../lib/events-functions'
import { fetchCurrentUser } from '../../../lib/auth-functions'
import { APP_TIME_ZONE } from '../../../lib/timezone'

const inactiveEventsQuery = queryOptions({
  queryKey: ['events', 'inactive'],
  queryFn: () => listEvents({ data: { inactive: true } }),
})

const currentUserQuery = queryOptions({
  queryKey: ['current-user'],
  queryFn: () => fetchCurrentUser(),
})

export const Route = createFileRoute('/_app/profil/event-nonaktif')({
  loader: async ({ context }) => {
    // Hanya pemilik brand. Admin dikembalikan ke menu Profil.
    const user = await context.queryClient.ensureQueryData(currentUserQuery)
    if (user?.brandRole !== 'owner') throw redirect({ to: '/profil' })
    await context.queryClient.ensureQueryData(inactiveEventsQuery)
  },
  component: EventNonaktifPage,
})

function formatIDR(value: string | number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(value))
}

function EventNonaktifPage() {
  const { data: events } = useSuspenseQuery(inactiveEventsQuery)

  return (
    <main className="mx-auto max-w-lg px-4 pb-8 pt-6">
      <header className="mb-6 flex items-center gap-3">
        <Link
          to="/profil"
          aria-label="Kembali"
          className="flex h-9 w-9 items-center justify-center rounded-full no-underline"
          style={{ color: 'var(--app-text)' }}
        >
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-lg font-bold">Event Nonaktif</h1>
          <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
            Event yang sudah selesai atau ditutup. Hanya pemilik brand yang
            bisa melihat daftar ini.
          </p>
        </div>
      </header>

      {events.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
          Tidak ada event nonaktif.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {events.map((event) => (
          <Link
            key={event.id}
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
                · {event.orderCount} pesanan · {formatIDR(event.amountIn)} masuk
              </span>
            </span>
            <ChevronRight size={18} style={{ color: 'var(--app-text-mute)' }} />
          </Link>
        ))}
      </div>
    </main>
  )
}

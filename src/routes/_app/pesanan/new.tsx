import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ChevronRight, ShoppingBag } from 'lucide-react'
import { listEvents } from '../../../lib/events-functions'

const eventsQuery = queryOptions({
  queryKey: ['events'],
  queryFn: () => listEvents(),
})

export const Route = createFileRoute('/_app/pesanan/new')({
  loader: ({ context }) => context.queryClient.ensureQueryData(eventsQuery),
  component: PickEventPage,
})

function PickEventPage() {
  const { data: events } = useSuspenseQuery(eventsQuery)
  // Event nonaktif tidak bisa ditambah pesanan baru (server juga menolak lewat
  // `createOrder`), jadi tidak perlu ikut ditampilkan di pemilih event ini.
  const activeEvents = events.filter((event) => event.isActive)

  return (
    <main className="mx-auto max-w-lg px-4 pb-8 pt-6">
      <h1 className="mb-1 text-xl font-bold">Tambah Pesanan</h1>
      <p className="mb-6 text-sm" style={{ color: 'var(--app-text-soft)' }}>
        Pilih event untuk pesanan ini.
      </p>

      {activeEvents.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
          {events.length > 0
            ? 'Semua event sedang nonaktif. Aktifkan dulu lewat menu ⋮ di halaman event.'
            : 'Belum ada event. Buat event dulu dari Beranda.'}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {activeEvents.map((event) => (
          <Link
            key={event.id}
            to="/events/$eventId"
            params={{ eventId: event.id }}
            search={{ addOrder: true }}
            className="app-card flex items-center gap-3 p-4 no-underline"
          >
            <span className="app-icon-tile h-10 w-10 flex-shrink-0">
              <ShoppingBag size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <p className="truncate font-semibold">{event.name}</p>
              <p className="text-xs" style={{ color: 'var(--app-text-soft)' }}>
                {new Date(event.eventDate).toLocaleDateString('id-ID')}
              </p>
            </span>
            <ChevronRight size={18} style={{ color: 'var(--app-text-mute)' }} />
          </Link>
        ))}
      </div>
    </main>
  )
}

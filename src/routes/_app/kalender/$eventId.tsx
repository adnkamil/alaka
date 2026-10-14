import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft, CalendarDays, MapPin, Store } from 'lucide-react'
import { getCalendarEvent } from '../../../lib/calendar-events-functions'
import { formatLongDate } from '../../../lib/calendar'

const calendarEventQuery = (id: string) =>
  queryOptions({
    queryKey: ['calendar-event', id],
    queryFn: () => getCalendarEvent({ data: { id } }),
  })

export const Route = createFileRoute('/_app/kalender/$eventId')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(calendarEventQuery(params.eventId)),
  component: CalendarEventDetailPage,
})

function CalendarEventDetailPage() {
  const { eventId } = Route.useParams()
  const { data: event } = useSuspenseQuery(calendarEventQuery(eventId))

  return (
    <main className="mx-auto max-w-lg pb-10">
      {/* Banner. Tombol kembali menumpang di atasnya supaya tetap terlihat
          walau gambar terang atau belum ada. */}
      <div
        className="relative w-full overflow-hidden"
        style={{
          aspectRatio: '16 / 9',
          background:
            'linear-gradient(135deg, var(--app-accent) 0%, var(--app-accent-strong) 100%)',
        }}
      >
        {event.bannerSrc ? (
          <img
            src={event.bannerSrc}
            alt={`Banner ${event.name}`}
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center opacity-40">
            <CalendarDays size={48} color="white" />
          </span>
        )}
        <Link
          to="/kalender"
          search={{ tanggal: event.eventDate }}
          aria-label="Kembali ke kalender"
          className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full"
          style={{
            background: 'rgba(0, 0, 0, 0.45)',
            color: 'white',
            top: 'max(0.75rem, env(safe-area-inset-top))',
          }}
        >
          <ArrowLeft size={20} />
        </Link>
      </div>

      <div className="px-4 pt-5">
        <h1 className="text-xl font-bold">{event.name}</h1>

        <div className="mt-3 flex flex-col gap-2">
          <p
            className="flex items-start gap-2 text-sm"
            style={{ color: 'var(--app-text-soft)' }}
          >
            <CalendarDays size={16} className="mt-0.5 flex-shrink-0" />
            <span>{formatLongDate(event.eventDate)}</span>
          </p>
          <p
            className="flex items-start gap-2 text-sm"
            style={{ color: 'var(--app-text-soft)' }}
          >
            <MapPin size={16} className="mt-0.5 flex-shrink-0" />
            <span>{event.location}</span>
          </p>
        </div>

        {event.description && (
          <section className="mt-6">
            <h2 className="mb-2 text-sm font-semibold">Tentang event</h2>
            <p
              className="whitespace-pre-line text-sm leading-relaxed"
              style={{ color: 'var(--app-text-soft)' }}
            >
              {event.description}
            </p>
          </section>
        )}

        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold">Brand yang dipamerkan</h2>
          {event.exhibitors.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
              Daftar brand belum tersedia.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {event.exhibitors.map((brand) => (
                <li
                  key={brand}
                  className="app-card flex items-center gap-1.5 px-3 py-1.5 text-sm"
                >
                  <Store
                    size={14}
                    style={{ color: 'var(--app-accent)' }}
                    className="flex-shrink-0"
                  />
                  {brand}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}

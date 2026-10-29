import { useState } from 'react'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { CalendarDays, MapPin, Plus } from 'lucide-react'
import { formatDateRange, isCalendarEventFinished } from '../../../lib/calendar'
import { adminCalendarEventsQuery } from '../../../lib/queries'
import { todayIsoDateInAppTimeZone } from '../../../lib/timezone'

export const Route = createFileRoute('/admin/event/')({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(adminCalendarEventsQuery),
  component: AdminEventListPage,
})

type Tab = 'upcoming' | 'past'

function AdminEventListPage() {
  const { data: events } = useSuspenseQuery(adminCalendarEventsQuery)
  const [tab, setTab] = useState<Tab>('upcoming')

  const today = todayIsoDateInAppTimeZone()
  // `events` terurut tanggal naik dari server; "Selesai" dibalik supaya yang
  // paling baru lewat ada di atas. Selesai = tanggal lewat ATAU diakhiri admin.
  const upcoming = events.filter(
    (event) => !isCalendarEventFinished(event, today),
  )
  const past = events
    .filter((event) => isCalendarEventFinished(event, today))
    .reverse()
  const visible = tab === 'upcoming' ? upcoming : past

  return (
    <main className="pm-wide mx-auto max-w-lg px-4 pb-8 pt-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold lg:text-[26px]">Event</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--app-text-soft)' }}>
            Event yang tampil di kalender semua user.
          </p>
        </div>
        <Link
          to="/admin/event/new"
          className="app-btn-primary flex-shrink-0 no-underline"
        >
          <Plus size={16} />
          Tambah
        </Link>
      </div>

      <div className="mb-4 flex gap-2" role="tablist" aria-label="Filter event">
        {(
          [
            { key: 'upcoming', label: 'Mendatang', count: upcoming.length },
            { key: 'past', label: 'Selesai', count: past.length },
          ] as const
        ).map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            onClick={() => setTab(item.key)}
            className="rounded-full px-3 py-1.5 text-xs font-semibold"
            style={{
              background:
                tab === item.key ? 'var(--app-accent)' : 'var(--app-card)',
              color: tab === item.key ? 'white' : 'var(--app-text-soft)',
              border: '1px solid var(--app-border)',
            }}
          >
            {item.label} ({item.count})
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--app-text-soft)' }}>
          {events.length === 0
            ? 'Belum ada event. Ketuk Tambah untuk membuat event pertama.'
            : tab === 'upcoming'
              ? 'Tidak ada event mendatang.'
              : 'Belum ada event yang selesai.'}
        </p>
      ) : (
        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-4">
          {visible.map((event) => (
            <Link
              key={event.id}
              to="/admin/event/$eventId"
              params={{ eventId: event.id }}
              className="app-card flex items-center gap-3 p-3 no-underline"
            >
              <span
                className="flex h-14 w-24 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg"
                style={{
                  background:
                    'linear-gradient(135deg, var(--app-accent) 0%, var(--app-accent-strong) 100%)',
                }}
              >
                {event.bannerSrc ? (
                  <img
                    src={event.bannerSrc}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <CalendarDays
                    size={20}
                    color="white"
                    className="opacity-50"
                  />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <p className="truncate font-semibold">{event.name}</p>
                <p
                  className="mt-0.5 text-xs"
                  style={{ color: 'var(--app-text-soft)' }}
                >
                  {formatDateRange(event.eventDate, event.endDate)}
                </p>
                <p
                  className="mt-0.5 flex items-center gap-1 text-xs"
                  style={{ color: 'var(--app-text-soft)' }}
                >
                  <MapPin size={12} className="flex-shrink-0" />
                  <span className="truncate">{event.location}</span>
                </p>
                <span className="mt-1.5 flex gap-1.5">
                  <span className="app-badge app-badge-accent">
                    {event.isOnline ? 'Online' : 'Offline'}
                  </span>
                  {event.isEnded && <span className="app-badge">Diakhiri</span>}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}

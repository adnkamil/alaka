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

const COLUMNS =
  'grid-cols-[minmax(0,1fr)_150px_170px_190px_90px_80px_100px_60px]'

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
          <h1 className="pm-display text-[22px] leading-tight lg:text-[26px]">
            Event
          </h1>
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
            className={`pm-chip ${tab === item.key ? 'pm-chip--active' : ''}`}
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
        <>
          <div className="flex flex-col gap-3 lg:hidden">
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
                    {event.isEnded && (
                      <span className="app-badge">Diakhiri</span>
                    )}
                    <span className="app-badge">
                      {event.creator.kind === 'partner'
                        ? `Partner: ${event.creator.name}`
                        : 'Admin'}
                    </span>
                    <span className="app-badge">
                      {event.jastiperCount} jastiper
                    </span>
                  </span>
                </span>
              </Link>
            ))}
          </div>

          <div className="app-card hidden overflow-hidden lg:block">
            <div
              className={`grid ${COLUMNS} items-center gap-4 px-5 py-3.5 text-[11px] font-bold uppercase tracking-wide`}
              style={{ background: 'var(--pm-tint)', color: 'var(--pm-gold)' }}
            >
              <span>Event</span>
              <span>Tanggal</span>
              <span>Lokasi</span>
              <span>Pembuat</span>
              <span>Tipe</span>
              <span>Jastiper</span>
              <span>Status</span>
              <span>Aksi</span>
            </div>
            {visible.map((event) => (
              <div
                key={event.id}
                className={`grid ${COLUMNS} items-center gap-4 border-t px-5 py-3`}
                style={{ borderColor: 'var(--app-border)' }}
              >
                <Link
                  to="/admin/event/$eventId"
                  params={{ eventId: event.id }}
                  className="flex min-w-0 items-center gap-3.5 no-underline"
                  style={{ color: 'inherit' }}
                >
                  <span
                    className="flex h-11 w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-xl"
                    style={{
                      background: 'var(--pm-tint)',
                      color: 'var(--pm-gold)',
                    }}
                  >
                    {event.bannerSrc ? (
                      <img
                        src={event.bannerSrc}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <CalendarDays size={20} />
                    )}
                  </span>
                  <span className="truncate text-sm font-bold">
                    {event.name}
                  </span>
                </Link>
                <span
                  className="text-[13px]"
                  style={{ color: 'var(--app-text-soft)' }}
                >
                  {formatDateRange(event.eventDate, event.endDate)}
                </span>
                <span
                  className="flex min-w-0 items-center gap-1.5 text-[13px]"
                  style={{ color: 'var(--app-text-soft)' }}
                >
                  <MapPin size={13} className="shrink-0" />
                  <span className="truncate">{event.location}</span>
                </span>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-[13px] font-semibold">
                    <span
                      className="app-badge shrink-0"
                      style={
                        event.creator.kind === 'partner'
                          ? {
                              background: 'var(--app-success-soft)',
                              color: 'var(--app-success)',
                            }
                          : {
                              background: 'var(--pm-tint)',
                              color: 'var(--pm-gold)',
                            }
                      }
                    >
                      {event.creator.kind === 'partner' ? 'Partner' : 'Admin'}
                    </span>
                    <span className="truncate">{event.creator.name}</span>
                  </p>
                  {event.creator.email && (
                    <p
                      className="truncate text-[11px]"
                      style={{ color: 'var(--app-text-mute)' }}
                    >
                      {event.creator.email}
                    </p>
                  )}
                </div>
                <div>
                  <span className="app-badge app-badge-accent">
                    {event.isOnline ? 'Online' : 'Offline'}
                  </span>
                </div>
                <span className="text-sm font-bold">{event.jastiperCount}</span>
                <div>
                  <span className="app-badge">
                    {event.isEnded
                      ? 'Diakhiri'
                      : tab === 'past'
                        ? 'Selesai'
                        : 'Mendatang'}
                  </span>
                </div>
                <Link
                  to="/admin/event/$eventId"
                  params={{ eventId: event.id }}
                  className="text-[13px] font-semibold no-underline"
                  style={{ color: 'var(--app-accent)' }}
                >
                  Detail
                </Link>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  )
}
